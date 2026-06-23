import { NextRequest, NextResponse } from "next/server"
import { sourceSecteur } from "@/lib/source-prospects"
import { generateEmailBatch } from "@/lib/generate-emails"
import { prisma } from "@/lib/prisma"
import { SECTEURS_ROTATION, COMMUNES, MAX_PAR_SECTEUR } from "@/lib/pipeline-config"

// Bouton "Préparer un gros stock" : source à travers les communes + génère les
// emails, en streaming (SSE). Lancé depuis le navigateur → pas de limite 60s,
// la connexion reste ouverte tant que le client lit. À faire ~1×/semaine.
//
// Body: { objectif?: number }  → nombre de prospects à constituer (défaut 100)

export const maxDuration = 300 // marge généreuse (le client garde la connexion)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const objectif: number = body.objectif ?? 100

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const send = (data: object) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    let sourced = 0
    let generated = 0

    try {
      const tousSecteurs = SECTEURS_ROTATION.flat()

      // 1. SOURCING — on ratisse commune par commune jusqu'à l'objectif.
      send({ type: "progress", message: `Objectif : ${objectif} prospects. Démarrage du sourcing...` })

      for (const commune of COMMUNES) {
        if (sourced >= objectif) break
        send({ type: "progress", message: `📍 Commune : ${commune}` })

        for (const secteur of tousSecteurs) {
          if (sourced >= objectif) break
          const avant = sourced
          sourced += await sourceSecteur(secteur, commune, MAX_PAR_SECTEUR)
          const nouveaux = sourced - avant
          if (nouveaux > 0) {
            send({ type: "progress", message: `  + ${nouveaux} en ${secteur} (${sourced}/${objectif})` })
          }
        }
      }

      // 2. GÉNÉRATION — on génère les emails pour tout le stock à contacter.
      send({ type: "progress", message: `Sourcing fini (${sourced}). Génération des emails...` })

      while (true) {
        const count = await generateEmailBatch({ take: 10 })
        if (!count) break
        generated += count
        send({ type: "progress", message: `  ✍️ ${generated} emails générés...` })
      }

      // Stock prêt à envoyer (email + corps).
      const stockPret = await prisma.prospect.count({
        where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
      })

      send({ type: "done", sourced, generated, stockPret })
    } catch (err) {
      send({ type: "error", message: String(err), sourced, generated })
    } finally {
      writer.close()
    }
  })()

  return new NextResponse(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
