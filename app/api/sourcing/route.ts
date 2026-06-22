import { NextRequest, NextResponse } from "next/server"
import { sourceSecteur } from "@/lib/source-prospects"

// Liste des secteurs proposés dans l'UI de sourcing.
const SECTEURS = [
  "avocat", "notaire", "comptable", "fiduciaire", "architecte",
  "dentiste", "kinésithérapeute", "ostéopathe", "vétérinaire",
  "photographe", "agence immobilière", "courtier en assurance",
  "coach", "traiteur", "salon de coiffure", "institut de beauté",
  "menuisier", "électricien",
]

export { SECTEURS }

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ville = "Bruxelles", secteurs = [], maxParSecteur = 10 } = body

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const send = (data: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  ;(async () => {
    let totalInserts = 0

    for (const secteur of secteurs as string[]) {
      send({ type: "progress", message: `Sourcing : ${secteur}...` })
      // Logique partagée avec le pipeline auto (lib/source-prospects.ts).
      const inserts = await sourceSecteur(secteur, ville, maxParSecteur, (msg) =>
        send({ type: "progress", message: msg })
      )
      totalInserts += inserts
    }

    send({ type: "done", totalInserts })
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
