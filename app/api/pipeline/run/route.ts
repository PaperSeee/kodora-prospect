import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPipelineReport } from "@/lib/pipeline-report"
import { dailyCap, jitterDelay, RUN_TIME_BUDGET_MS } from "@/lib/pipeline-config"

// ── CRON QUOTIDIEN : ENVOI SEUL ──
// Le sourcing + la génération se font à la main via le bouton "Préparer un gros
// stock" (route /api/pipeline/stock), qui n'a pas la limite 60s. Ici on fait
// UNIQUEMENT l'envoi du lot du jour depuis le stock prêt → rapide, jamais de
// timeout. Plafond progressif (ramp) + délai aléatoire + rapport mail.
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

  // ── Plafond du jour (ramp) ──
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

  let sent = 0

  try {
    if (!dryRun && remaining > 0) {
      const prospects = await prisma.prospect.findMany({
        where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
        orderBy: { score: "desc" }, // meilleures opportunités d'abord
        take: remaining,
      })

      for (const prospect of prospects) {
        if (timeLeft() < 6000) break // marge avant le timeout

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
      data: { finishedAt: new Date(), sent, status: "done" },
    })

    // Rapport récap par email (pas en dry-run).
    if (!dryRun) {
      await sendPipelineReport({ cap, sourced: 0, generated: 0, sent, status: "done" })
    }

    return NextResponse.json({
      ok: true, dryRun, cap, alreadySentToday, remaining, sent,
      note: sent < remaining ? "Stock épuisé ou budget temps atteint — prépare un gros stock via le bouton." : undefined,
    })
  } catch (err) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), sent, status: "error", error: String(err) },
    })
    await sendPipelineReport({ cap, sourced: 0, generated: 0, sent, status: "error", error: String(err) })
    return NextResponse.json({ ok: false, error: String(err), sent }, { status: 500 })
  }
}

// Le cron Vercel envoie un GET par défaut.
export async function GET(req: NextRequest) {
  return POST(req)
}
