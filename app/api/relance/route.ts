import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { relanceEmailTemplate } from "@/lib/email-templates"

export const maxDuration = 300

const DELAI_JOURS = 3

export async function POST() {
  // RELANCE EN PAUSE — réactiver quand le stock de nouveaux prospects est épuisé
  return NextResponse.json({ paused: true, message: "Relance en pause" })

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return NextResponse.json({ error: "BREVO_API_KEY manquante" }, { status: 400 })

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DELAI_JOURS)

  // Prospects contactés il y a 3+ jours, pas encore relancés, toujours en "contacte"
  const prospects = await prisma.prospect.findMany({
    where: {
      statut: "contacte",
      email: { not: null },
      relancee: false,
      updatedAt: { lte: cutoff },
    },
  })

  if (!prospects.length) {
    return NextResponse.json({ count: 0, message: "Aucune relance à envoyer" })
  }

  let count = 0
  const errors: string[] = []

  for (const prospect of prospects) {
    try {
      const { objet, corps } = relanceEmailTemplate(
        prospect.nom,
        prospect.secteur,
        prospect.emailOuvert
      )

      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: {
            name: "Ilias — Kodora",
            email: process.env.BREVO_SENDER_EMAIL ?? "contact@kodora.eu",
          },
          to: [{ email: prospect.email!, name: prospect.nom }],
          subject: objet,
          textContent: corps,
        }),
      })

      if (res.ok) {
        await prisma.prospect.update({
          where: { id: prospect.id },
          data: { relancee: true, relanceeAt: new Date() },
        })
        count++
      } else {
        const err = await res.json().catch(() => ({}))
        errors.push(`${prospect.nom}: ${JSON.stringify(err)}`)
      }

      await new Promise((r) => setTimeout(r, 200))
    } catch (err) {
      errors.push(`${prospect.nom}: ${err}`)
    }
  }

  return NextResponse.json({ count, errors: errors.slice(0, 5) })
}
