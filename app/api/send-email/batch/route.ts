import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { emailDomainAcceptsMail } from "@/lib/verify-email"

export async function POST(req: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return NextResponse.json({ error: "BREVO_API_KEY manquante" }, { status: 400 })

  // Tous les prospects avec email + emailCorps + pas encore contactés
  const prospects = await prisma.prospect.findMany({
    where: {
      email: { not: null },
      emailCorps: { not: null },
      statut: "a_contacter",
    },
  })

  if (!prospects.length) return NextResponse.json({ count: 0, message: "Aucun prospect prêt à envoyer" })

  let count = 0
  const errors: string[] = []

  for (const prospect of prospects) {
    try {
      // Vérif MX gratuite : évite les hard bounces qui plombent la
      // réputation du domaine. L'email invalide est purgé de la fiche.
      if (!(await emailDomainAcceptsMail(prospect.email!))) {
        await prisma.prospect.update({
          where: { id: prospect.id },
          data: { email: null, notes: `Email invalide (domaine sans MX) : ${prospect.email}` },
        })
        errors.push(`${prospect.nom}: domaine email sans MX, envoi annulé`)
        continue
      }

      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: {
            name: "Ilias — Kodora",
            email: process.env.BREVO_SENDER_EMAIL ?? "contact@kodora.eu",
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
        count++
      } else {
        const err = await res.json().catch(() => ({}))
        errors.push(`${prospect.nom}: ${JSON.stringify(err)}`)
      }

      // Pause entre envois pour ne pas spam
      await new Promise((r) => setTimeout(r, 200))
    } catch (err) {
      errors.push(`${prospect.nom}: ${err}`)
    }
  }

  return NextResponse.json({ count, errors: errors.slice(0, 5) })
}
