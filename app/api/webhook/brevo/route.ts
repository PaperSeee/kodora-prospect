import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Brevo envoie les événements email ici
// Configurer dans Brevo : Paramètres → Webhooks → URL = https://ton-domaine/api/webhook/brevo
// Événements à cocher : opened, clicked
export async function POST(req: NextRequest) {
  try {
    const events = await req.json()
    const list = Array.isArray(events) ? events : [events]

    for (const event of list) {
      const toEmail = event.email
      if (!toEmail) continue

      // Tracking ouverture
      if (event.event === "opened" || event.event === "clicked") {
        await prisma.prospect.updateMany({
          where: { email: toEmail, emailOuvert: false },
          data: { emailOuvert: true, emailOuvertAt: new Date() },
        })
      }

      // STOP / désabonnement — bloquer toute relance future
      if (
        event.event === "unsubscribed" ||
        event.event === "hard_bounce" ||
        event.event === "complaint"
      ) {
        await prisma.prospect.updateMany({
          where: { email: toEmail },
          data: { statut: "desabonne" },
        })
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
