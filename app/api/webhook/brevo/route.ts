import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Brevo envoie les événements email ici.
// Configurer dans Brevo : Paramètres → Webhooks → URL = https://ton-domaine/api/webhook/brevo
// Événements à cocher : delivered, hard_bounce, soft_bounce, blocked, deferred,
// spam (complaint), unsubscribed, opened, clicked — voir le récap en fin de PR.
//
// Chaque événement reçu est journalisé dans EmailEvent AVANT tout traitement,
// sans exception : c'est la source de vérité, les champs du prospect n'en
// sont qu'une projection recalculable. La corrélation se fait par messageId
// (stocké au moment de l'envoi, voir lib/send-brevo-email.ts) — l'email seul
// ne suffit pas si un prospect reçoit plusieurs envois.
export async function POST(req: NextRequest) {
  try {
    const events = await req.json()
    const list = Array.isArray(events) ? events : [events]

    for (const event of list) {
      const toEmail: string | undefined = event.email
      // Brevo envoie le message-id sous des casses différentes selon les
      // events legacy vs webhooks v3 — on couvre les variantes connues.
      const messageId: string | undefined =
        event["message-id"] ?? event.messageId ?? event["message_id"] ?? undefined

      if (!toEmail && !messageId) continue

      const prospect = messageId
        ? (await prisma.sendAttempt.findFirst({
            where: { messageId },
            orderBy: { startedAt: "desc" },
          }).then((a) => a?.prospectId ?? null))
        : null

      const resolvedProspectId =
        prospect ??
        (toEmail
          ? (await prisma.prospect.findFirst({ where: { email: toEmail }, select: { id: true } }))?.id ?? null
          : null)

      await prisma.emailEvent.create({
        data: {
          prospectId: resolvedProspectId,
          messageId: messageId ?? null,
          event: String(event.event ?? "unknown"),
          payload: JSON.stringify(event),
        },
      })

      if (resolvedProspectId === null) continue
      const where = { id: resolvedProspectId }

      switch (event.event) {
        case "delivered":
          // Seul événement qui prouve que le message est arrivé chez le
          // destinataire — c'est la SEULE écriture du statut "contacte".
          await prisma.prospect.update({ where, data: { statut: "contacte" } })
          break

        case "hard_bounce":
        case "soft_bounce":
          await prisma.prospect.update({ where, data: { statut: "bounce" } })
          break

        case "blocked":
          await prisma.prospect.update({ where, data: { statut: "bloque" } })
          break

        case "spam":
        case "complaint":
          await prisma.prospect.update({ where, data: { statut: "spam" } })
          break

        case "unsubscribed":
          await prisma.prospect.update({ where, data: { statut: "desabonne" } })
          break

        case "opened":
        case "clicked":
          await prisma.prospect.updateMany({
            where: { id: resolvedProspectId, emailOuvert: false },
            data: { emailOuvert: true, emailOuvertAt: new Date() },
          })
          break

        // "deferred" : tentative de remise différée par le serveur
        // destinataire, pas encore un échec — on la journalise (EmailEvent
        // ci-dessus) sans changer le statut. Un "delivered" ou un
        // "hard_bounce" suivra.
        default:
          break
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}

// Brevo vérifie parfois le webhook avec un GET
export async function GET() {
  return NextResponse.json({ ok: true })
}
