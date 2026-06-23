import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sourceSecteur } from "@/lib/source-prospects"
import { generateEmailBatch } from "@/lib/generate-emails"
import { sendPipelineReport } from "@/lib/pipeline-report"
import {
  SECTEURS_ROTATION,
  COMMUNES,
  MAX_PAR_SECTEUR,
  objectifSourcing,
  MAX_TENTATIVES_PAR_RUN,
  DIAG_TIMEOUT_PIPELINE_MS,
  dailyCap,
  jitterDelay,
  RUN_TIME_BUDGET_MS,
} from "@/lib/pipeline-config"

// Orchestrateur du pipeline auto : source → génère → envoie (plafonné + ramp).
// Appelé 1×/jour par le cron Vercel (voir vercel.json), ou manuellement.
//
// Garde-fous :
//  - plafond d'envoi quotidien progressif (warm-up) → lib/pipeline-config.ts
//  - délai aléatoire entre chaque envoi (pas de burst)
//  - ne dépasse jamais le cap, même si appelé plusieurs fois dans la journée
//  - budget temps : s'arrête proprement avant la limite 60s de Vercel Hobby
//
// Vercel Hobby : maxDuration plafonné à 60s. On reste dessous via RUN_TIME_BUDGET_MS.
export const maxDuration = 60

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Le cron Vercel envoie "Authorization: Bearer <CRON_SECRET>".
// On accepte aussi un appel manuel authentifié par x-api-key (interne).
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  const internalKey = process.env.KODORA_INTERNAL_API_KEY
  const xKey = req.headers.get("x-api-key")
  if (internalKey && xKey === internalKey) return true

  // Si aucun secret n'est configuré (dev local), on laisse passer.
  if (!cronSecret && !internalKey) return true

  return false
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "BREVO_API_KEY manquante" }, { status: 400 })
  }

  const startedMs = Date.now()
  const timeLeft = () => RUN_TIME_BUDGET_MS - (Date.now() - startedMs)

  const dryRun = req.nextUrl.searchParams.get("dry") === "1"

  // ── 1. Plafond du jour (ramp) ──
  const firstRun = await prisma.pipelineRun.findFirst({ orderBy: { startedAt: "asc" } })
  const daysSinceStart = firstRun
    ? Math.floor((Date.now() - firstRun.startedAt.getTime()) / 86_400_000)
    : 0
  const cap = dailyCap(daysSinceStart)

  // Déjà envoyés aujourd'hui → ne pas dépasser le cap.
  const today = startOfToday()
  const runsToday = await prisma.pipelineRun.findMany({ where: { startedAt: { gte: today } } })
  const alreadySentToday = runsToday.reduce((s, r) => s + r.sent, 0)
  const remaining = Math.max(0, cap - alreadySentToday)

  const run = await prisma.pipelineRun.create({ data: { capUsed: cap, status: "running" } })

  let sourced = 0
  let generated = 0
  let sent = 0

  try {
    // ── 2. SOURCING — Bruxelles d'abord, puis les communes jusqu'à l'objectif ──
    // On parcourt les combinaisons commune × secteur : pour chaque commune
    // (Bruxelles, Ixelles, Schaerbeek…), on essaie les secteurs. Dès que la
    // commune est épuisée (que des doublons), on passe à la suivante. On s'arrête
    // quand l'objectif de NOUVEAUX prospects est atteint, ou MAX_TENTATIVES, ou
    // le budget temps (60s Hobby). Le point de départ tourne chaque jour.
    const dayIndex = Math.floor(Date.now() / 86_400_000)
    const tousSecteurs = SECTEURS_ROTATION.flat()
    const startSecteur = dayIndex % tousSecteurs.length
    // Objectif aligné sur le plafond d'envoi du jour : on source assez pour
    // alimenter le cap (le sourcing monte donc tout seul avec le ramp).
    const objectif = objectifSourcing(cap)

    let tentatives = 0
    for (const commune of COMMUNES) {
      if (sourced >= objectif || timeLeft() < 20_000) break

      for (let i = 0; i < tousSecteurs.length; i++) {
        if (sourced >= objectif) break
        if (timeLeft() < 20_000) break
        if (tentatives >= MAX_TENTATIVES_PAR_RUN) break

        const secteur = tousSecteurs[(startSecteur + i) % tousSecteurs.length]
        tentatives++
        sourced += await sourceSecteur(
          secteur,
          commune,
          MAX_PAR_SECTEUR,
          undefined,
          DIAG_TIMEOUT_PIPELINE_MS,
        )
      }

      if (tentatives >= MAX_TENTATIVES_PAR_RUN) break
    }

    // ── 3. GÉNÉRATION des emails manquants (appel direct, pas de fetch interne) ──
    while (timeLeft() > 15_000) {
      const count = await generateEmailBatch({ take: 10 })
      generated += count
      if (!count) break // plus rien à générer
      if (generated >= remaining + 10) break
    }

    // ── 4. ENVOI plafonné + jitter, borné par le budget temps ──
    if (!dryRun && remaining > 0) {
      const prospects = await prisma.prospect.findMany({
        where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
        orderBy: { score: "desc" }, // meilleures opportunités d'abord
        take: remaining,
      })

      for (const prospect of prospects) {
        if (timeLeft() < 6000) break // garde une marge avant le timeout

        try {
          const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: {
                name: "Ilias — Kodora",
                email: process.env.BREVO_SENDER_EMAIL ?? "ilias300@outlook.be",
              },
              to: [{ email: prospect.email!, name: prospect.nom }],
              subject: prospect.emailObjet ?? `Votre présence en ligne — ${prospect.nom}`,
              ...(prospect.emailHtml
                ? { htmlContent: prospect.emailHtml, textContent: prospect.emailCorps! }
                : { textContent: prospect.emailCorps! }),
            }),
          })

          if (res.ok) {
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { statut: "contacte" },
            })
            sent++
          }
        } catch (err) {
          console.error("[pipeline] send error:", err)
        }

        if (timeLeft() > 6000) {
          await new Promise((r) => setTimeout(r, jitterDelay()))
        }
      }
    }

    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), sourced, generated, sent, status: "done" },
    })

    // Rapport récap par email (pas en dry-run, pour ne pas spammer en test).
    if (!dryRun) {
      await sendPipelineReport({ cap, sourced, generated, sent, status: "done" })
    }

    return NextResponse.json({
      ok: true, dryRun, cap, alreadySentToday, remaining,
      sourced, generated, sent,
      note: sent < remaining ? "Budget temps atteint — le reste partira au prochain run." : undefined,
    })
  } catch (err) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), sourced, generated, sent, status: "error", error: String(err) },
    })
    await sendPipelineReport({ cap, sourced, generated, sent, status: "error", error: String(err) })
    return NextResponse.json({ ok: false, error: String(err), sourced, generated, sent }, { status: 500 })
  }
}

// Permet aussi le déclenchement par GET (cron Vercel envoie un GET par défaut).
export async function GET(req: NextRequest) {
  return POST(req)
}
