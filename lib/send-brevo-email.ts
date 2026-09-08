import { prisma } from "@/lib/prisma"
import { SEND_EMAIL_ENABLED } from "@/lib/pipeline-config"

// Envoi d'un email transactionnel via Brevo, journalisé sans exception :
// chaque tentative (réussie ou non) crée un SendAttempt, et un res.ok
// stocke le messageId Brevo — seule clé de corrélation fiable avec les
// webhooks reçus plus tard sur /api/webhook/brevo. Avant ce correctif, ce
// messageId était calculé par Brevo puis jeté sans être lu.
//
// res.ok signifie "Brevo a accepté le message dans sa file d'envoi", PAS
// "le message est arrivé chez le destinataire" — voir statut "en_file" vs
// "contacte" dans les routes appelantes.

export interface SendEmailInput {
  prospectId: number
  to: { email: string; name?: string }
  subject: string
  textContent: string
  htmlContent?: string
}

export interface SendEmailResult {
  ok: boolean
  httpStatus: number
  messageId: string | null
  error?: unknown
}

export async function sendBrevoEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Canal email désactivé — remplacé par le tableau WhatsApp (/whatsapp).
  // Point de passage unique de tous les envois (cron, batch manuel, envoi
  // ponctuel) : un seul flag ici les coupe tous sans toucher aux routes ni
  // aux templates. Voir SEND_EMAIL_ENABLED dans lib/pipeline-config.ts.
  if (!SEND_EMAIL_ENABLED) {
    await prisma.sendAttempt.create({
      data: { prospectId: input.prospectId, httpStatus: null, error: "SEND_EMAIL_ENABLED=false — envoi désactivé" },
    })
    return { ok: false, httpStatus: 0, messageId: null, error: "SEND_EMAIL_ENABLED=false" }
  }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    await prisma.sendAttempt.create({
      data: { prospectId: input.prospectId, httpStatus: null, error: "BREVO_API_KEY manquante" },
    })
    return { ok: false, httpStatus: 0, messageId: null, error: "BREVO_API_KEY manquante" }
  }

  let res: Response
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Ilias — Kodora", email: process.env.BREVO_SENDER_EMAIL ?? "contact@kodora.eu" },
        replyTo: { name: "Ilias — Kodora", email: process.env.BREVO_REPLY_TO ?? "contact@kodora.eu" },
        to: [input.to],
        subject: input.subject,
        ...(input.htmlContent
          ? { htmlContent: input.htmlContent, textContent: input.textContent }
          : { textContent: input.textContent }),
      }),
    })
  } catch (err) {
    await prisma.sendAttempt.create({
      data: { prospectId: input.prospectId, httpStatus: null, error: String(err) },
    })
    return { ok: false, httpStatus: 0, messageId: null, error: String(err) }
  }

  const body = await res.json().catch(() => ({}) as Record<string, unknown>)
  const messageId = typeof body.messageId === "string" ? body.messageId : null

  await prisma.sendAttempt.create({
    data: {
      prospectId: input.prospectId,
      httpStatus: res.status,
      messageId,
      error: res.ok ? null : JSON.stringify(body),
    },
  })

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, messageId, error: body }
  }

  // res.ok = accepté par Brevo, PAS remis. Le statut "contacte" n'est écrit
  // que par le webhook "delivered" (voir /api/webhook/brevo).
  await prisma.prospect.update({
    where: { id: input.prospectId },
    data: { statut: "en_file" },
  })

  return { ok: true, httpStatus: res.status, messageId }
}
