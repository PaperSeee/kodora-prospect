import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendBrevoEmail } from "@/lib/send-brevo-email"

export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!process.env.BREVO_API_KEY) return NextResponse.json({ error: "BREVO_API_KEY manquante" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const limit = Math.min(Math.max(1, parseInt(body.limit) || 300), 300)

  const allProspects = await prisma.prospect.findMany({
    where: {
      email: { not: null },
      emailCorps: { not: null },
      statut: "a_contacter",
    },
    orderBy: { score: "desc" },
  })

  const prospects = allProspects.slice(0, limit)

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
        // res.ok = accepté par Brevo (→ statut "en_file"), pas remis. Le
        // frontend ne doit donc plus afficher "Contacté" ici — le vrai
        // statut "contacte" n'arrive que via le webhook "delivered".
        const result = await sendBrevoEmail({
          prospectId: prospect.id,
          to: { email: prospect.email!, name: prospect.nom },
          subject: prospect.emailObjet ?? `Votre présence en ligne — ${prospect.nom}`,
          textContent: prospect.emailCorps!,
          htmlContent: prospect.emailHtml ?? undefined,
        })

        if (result.ok) {
          count++
          send({ type: "sent", prospectId: prospect.id, nom: prospect.nom, count })
        } else {
          const errMsg = `${prospect.nom}: ${JSON.stringify(result.error)}`
          errors.push(errMsg)
          send({ type: "error", nom: prospect.nom, error: errMsg })
        }

        // Délai aléatoire 3-8s pour éviter les filtres anti-spam (envoi trop rapide)
        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 5000))
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
