import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPipelineReport, type EnvoiDetail } from "@/lib/pipeline-report"
import { dailyCap, jitterDelay, RUN_TIME_BUDGET_MS, RELANCES_ACTIVES, RELANCES_SEULEMENT_APRES } from "@/lib/pipeline-config"
import { sendBrevoEmail } from "@/lib/send-brevo-email"
import { shouldAlertOnRunOutcome, notifyPipelineFailure } from "@/lib/pipeline-alert"

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

  if (!process.env.BREVO_API_KEY) {
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
  let failed = 0
  let eligible = 0
  const envois: EnvoiDetail[] = []

  try {
    if (!dryRun && remaining > 0) {
      const prospects = await prisma.prospect.findMany({
        where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
        orderBy: { score: "desc" }, // meilleures opportunités d'abord
        take: remaining,
      })
      eligible = prospects.length

      for (const prospect of prospects) {
        if (timeLeft() < 6000) break // marge avant le timeout

        try {
          // Vérif MX gratuite : un hard bounce évité = réputation préservée.
          const { emailDomainAcceptsMail } = await import("@/lib/verify-email")
          if (!(await emailDomainAcceptsMail(prospect.email!))) {
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { email: null, notes: `Email invalide (domaine sans MX) : ${prospect.email}` },
            })
            continue
          }

          // res.ok = accepté par Brevo (→ "en_file"), pas remis — "contacte"
          // n'est écrit que par le webhook "delivered" (voir /api/webhook/brevo).
          const result = await sendBrevoEmail({
            prospectId: prospect.id,
            to: { email: prospect.email!, name: prospect.nom },
            subject: prospect.emailObjet ?? `Votre présence en ligne — ${prospect.nom}`,
            textContent: prospect.emailCorps!,
            htmlContent: prospect.emailHtml ?? undefined,
          })

          if (result.ok) {
            sent++
            envois.push({
              nom: prospect.nom,
              email: prospect.email!,
              objet: prospect.emailObjet ?? `Votre présence en ligne — ${prospect.nom}`,
              corps: prospect.emailCorps!,
            })
          } else {
            failed++
            console.error("[pipeline] send failed:", prospect.id, result.error)
          }
        } catch (err) {
          failed++
          console.error("[pipeline] send error:", err)
        }

        if (timeLeft() > 6000) {
          await new Promise((r) => setTimeout(r, jitterDelay()))
        }
      }
    }

    // ── RELANCES J+3 ──
    // Le reliquat du quota quotidien sert à relancer les prospects contactés
    // il y a 3+ jours restés sans suite : une relance unique augmente
    // typiquement le taux de réponse de moitié. Une seule relance par
    // prospect (flag relancee), même vérif MX, même plafond quotidien.
    let relances = 0
    if (RELANCES_ACTIVES && !dryRun && sent < remaining && timeLeft() > 10_000) {
      const cutoff = new Date(Date.now() - 3 * 86_400_000)
      const aRelancer = await prisma.prospect.findMany({
        // gte: ne relance QUE les contacts de la nouvelle campagne — les
        // prospects des anciennes campagnes ne sont jamais recontactés.
        where: { statut: "contacte", relancee: false, email: { not: null }, updatedAt: { lte: cutoff, gte: RELANCES_SEULEMENT_APRES } },
        orderBy: { score: "desc" },
        take: remaining - sent,
      })

      eligible += aRelancer.length

      for (const prospect of aRelancer) {
        if (timeLeft() < 6000) break

        try {
          const { emailDomainAcceptsMail } = await import("@/lib/verify-email")
          if (!(await emailDomainAcceptsMail(prospect.email!))) {
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { email: null, notes: `Email invalide (domaine sans MX) : ${prospect.email}` },
            })
            continue
          }

          const { relanceEmailTemplate } = await import("@/lib/email-templates")
          const { objet, corps } = relanceEmailTemplate(prospect.nom, prospect.secteur, prospect.emailOuvert)

          const result = await sendBrevoEmail({
            prospectId: prospect.id,
            to: { email: prospect.email!, name: prospect.nom },
            subject: objet,
            textContent: corps,
          })

          if (result.ok) {
            // relancee/relanceeAt restent la trace de la relance elle-même ;
            // le statut du prospect suit son propre cycle de vie normal
            // (en_file → contacte via webhook), sendBrevoEmail s'en charge.
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { relancee: true, relanceeAt: new Date() },
            })
            sent++
            relances++
            envois.push({ nom: `${prospect.nom} (relance)`, email: prospect.email!, objet, corps })
          } else {
            failed++
            console.error("[pipeline] relance failed:", prospect.id, result.error)
          }
        } catch (err) {
          failed++
          console.error("[pipeline] relance error:", err)
        }

        if (timeLeft() > 6000) {
          await new Promise((r) => setTimeout(r, jitterDelay()))
        }
      }
    }

    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), sent, eligible, failed, status: "done" },
    })

    // Rapport récap par email (pas en dry-run), avec le détail de chaque envoi.
    if (!dryRun) {
      await sendPipelineReport({ cap, sourced: 0, generated: 0, sent, status: "done", envois })
    }

    // Alerte dure : panne silencieuse impossible. Un run avec des
    // prospects éligibles mais 0 envoyé, ou un taux d'échec > 20%, déclenche
    // une notification immédiate au lieu de se perdre dans les logs.
    const alertMessage = dryRun ? null : shouldAlertOnRunOutcome({ eligible, sent, failed })
    if (alertMessage) await notifyPipelineFailure(alertMessage)

    return NextResponse.json({
      ok: true, dryRun, cap, alreadySentToday, remaining, sent, relances, eligible, failed,
      note: sent < remaining ? "Stock épuisé ou budget temps atteint — prépare un gros stock via le bouton." : undefined,
    })
  } catch (err) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), sent, eligible, failed, status: "error", error: String(err) },
    })
    await sendPipelineReport({ cap, sourced: 0, generated: 0, sent, status: "error", error: String(err), envois })
    await notifyPipelineFailure(`Pipeline en erreur : ${String(err)}`)
    return NextResponse.json({ ok: false, error: String(err), sent }, { status: 500 })
  }
}

// Le cron Vercel envoie un GET par défaut.
export async function GET(req: NextRequest) {
  return POST(req)
}
