import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const { prospectId } = await req.json()
  const apiKey = process.env.BREVO_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: "BREVO_API_KEY manquante dans .env.local" }, { status: 400 })
  }

  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } })
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 })
  if (!prospect.emailCorps) return NextResponse.json({ error: "Pas d'email généré pour ce prospect" }, { status: 400 })

  // Extraire l'email du prospect (champ optionnel — à ajouter au schema si besoin)
  // Pour l'instant on retourne une erreur explicative si pas d'email
  const emailDest = (prospect as Record<string, unknown>).email as string | undefined
  if (!emailDest) {
    return NextResponse.json(
      { error: "Ce prospect n'a pas d'adresse email. Ajoutez-la dans la fiche." },
      { status: 400 }
    )
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Ilias — Kodora", email: process.env.BREVO_SENDER_EMAIL ?? "ilias300@outlook.be" },
      to: [{ email: emailDest, name: prospect.nom }],
      subject: prospect.emailObjet ?? `Votre présence en ligne — ${prospect.nom}`,
      ...(prospect.emailHtml
        ? { htmlContent: prospect.emailHtml, textContent: prospect.emailCorps }
        : { textContent: prospect.emailCorps }),
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: "Erreur Brevo", detail: err }, { status: 500 })
  }

  // Marquer comme contacté
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { statut: "contacte" },
  })

  return NextResponse.json({ ok: true })
}
