import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return NextResponse.json({ error: "BREVO_API_KEY manquante" }, { status: 400 })

  const prospects = await prisma.prospect.findMany({
    where: {
      email: { not: null },
      emailCorps: { not: null },
      statut: "a_contacter",
    },
  })

  if (!prospects.length) {
    return NextResponse.json({ count: 0, message: "Aucun prospect prêt" })
  }

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const send = (data: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    let count = 0
    const errors: string[] = []

    send({ type: "start", total: prospects.length })

    for (const prospect of prospects) {
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
            textContent: prospect.emailCorps!,
          }),
        })

        if (res.ok) {
          await prisma.prospect.update({
            where: { id: prospect.id },
            data: { statut: "contacte" },
          })
          count++
          send({ type: "sent", prospectId: prospect.id, nom: prospect.nom, count })
        } else {
          const err = await res.json().catch(() => ({}))
          const errMsg = `${prospect.nom}: ${JSON.stringify(err)}`
          errors.push(errMsg)
          send({ type: "error", nom: prospect.nom, error: errMsg })
        }

        await new Promise((r) => setTimeout(r, 200))
      } catch (err) {
        const errMsg = `${prospect.nom}: ${err}`
        errors.push(errMsg)
        send({ type: "error", nom: prospect.nom, error: errMsg })
      }
    }

    send({ type: "done", count, errors: errors.slice(0, 5) })
    writer.close()
  })()

  return new NextResponse(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
