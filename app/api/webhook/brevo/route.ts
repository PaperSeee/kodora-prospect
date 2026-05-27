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
      if (event.event !== "opened" && event.event !== "clicked") continue

      const toEmail = event.email
      if (!toEmail) continue

      await prisma.prospect.updateMany({
        where: { email: toEmail, emailOuvert: false },
        data: { emailOuvert: true, emailOuvertAt: new Date() },
      })
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
