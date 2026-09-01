import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendBrevoEmail } from "@/lib/send-brevo-email"

export async function POST(req: NextRequest) {
  const { prospectId } = await req.json()

  if (!process.env.BREVO_API_KEY) {
    return NextResponse.json({ error: "BREVO_API_KEY manquante dans .env.local" }, { status: 400 })
  }

  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } })
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 })
  if (!prospect.emailCorps) return NextResponse.json({ error: "Pas d'email généré pour ce prospect" }, { status: 400 })

  const emailDest = prospect.email
  if (!emailDest) {
    return NextResponse.json(
      { error: "Ce prospect n'a pas d'adresse email. Ajoutez-la dans la fiche." },
      { status: 400 }
    )
  }

  // res.ok signifie "accepté par Brevo", pas "remis" — le statut passe à
  // "en_file" ici, et ne passera à "contacte" qu'à la réception du webhook
  // "delivered" pour ce messageId (voir /api/webhook/brevo).
  const result = await sendBrevoEmail({
    prospectId,
    to: { email: emailDest, name: prospect.nom },
    subject: prospect.emailObjet ?? `Votre présence en ligne — ${prospect.nom}`,
    textContent: prospect.emailCorps,
    htmlContent: prospect.emailHtml ?? undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: "Erreur Brevo", detail: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, messageId: result.messageId })
}
