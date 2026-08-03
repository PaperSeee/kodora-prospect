import { NextRequest, NextResponse } from "next/server"
import { sourceSecteur } from "@/lib/source-prospects"
import { COMMUNES, DIAG_TIMEOUT_PIPELINE_MS, RUN_TIME_BUDGET_MS } from "@/lib/pipeline-config"

export const maxDuration = 60 // Vercel Hobby : plafond réel.

// Liste des secteurs proposés dans l'UI de sourcing.
const SECTEURS = [
  "avocat", "notaire", "comptable", "fiduciaire", "architecte",
  "dentiste", "kinésithérapeute", "ostéopathe", "vétérinaire",
  "photographe", "agence immobilière", "courtier en assurance",
  "coach", "traiteur", "salon de coiffure", "institut de beauté",
  "menuisier", "électricien",
]

export { SECTEURS }

// Sourcing manuel depuis l'UI.
//   - ville unique (défaut "Bruxelles"), OU
//   - toutesCommunes: true → ratisse les 19 communes de Bruxelles-Capitale,
//     borné par un budget temps (Vercel Hobby = 60s) avec reprise via le
//     curseur `communeStart` renvoyé dans l'événement `done`.
//
// Body: { ville?, secteurs[], maxParSecteur?, toutesCommunes?, communeStart? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    ville = "Bruxelles",
    secteurs = [],
    maxParSecteur = 10,
    toutesCommunes = false,
  } = body
  const communeStart: number = Math.min(
    Math.max(Number(body.communeStart) || 0, 0),
    COMMUNES.length - 1
  )

  // Une seule ville → pas de budget temps agressif (petit volume) ; diagnostic
  // généreux. Multi-communes → diagnostic court pour caser plus dans les 52s.
  const deadline = Date.now() + RUN_TIME_BUDGET_MS
  const diagTimeout = toutesCommunes ? DIAG_TIMEOUT_PIPELINE_MS : 10000

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Si le client se déconnecte, le writer est fermé : on avale l'erreur au lieu
  // de planter le process (unhandledRejection "WritableStream is closed").
  let clientParti = false
  const send = (data: object) => {
    if (clientParti) return
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {
      clientParti = true
    })
  }

  ;(async () => {
    let totalInserts = 0

    try {
      if (!toutesCommunes) {
        // ── Mode ville unique (comportement historique) ──
        for (const secteur of secteurs as string[]) {
          if (Date.now() >= deadline) {
            send({ type: "progress", message: `⏭️ Temps écoulé — relancez pour continuer les secteurs restants.` })
            break
          }
          send({ type: "progress", message: `Sourcing : ${secteur} @ ${ville}...` })
          totalInserts += await sourceSecteur(
            secteur, ville, maxParSecteur,
            (msg) => send({ type: "progress", message: msg }),
            diagTimeout, deadline
          )
        }
        send({ type: "done", totalInserts, termine: true })
        return
      }

      // ── Mode toutes les communes, borné par le temps + reprise ──
      let prochaineCommune = COMMUNES.length
      for (let ci = communeStart; ci < COMMUNES.length; ci++) {
        const commune = COMMUNES[ci]
        if (Date.now() >= deadline) { prochaineCommune = ci; break }
        send({ type: "progress", message: `📍 Commune : ${commune}` })

        for (const secteur of secteurs as string[]) {
          if (Date.now() >= deadline) break
          const avant = totalInserts
          totalInserts += await sourceSecteur(
            secteur, commune, maxParSecteur,
            (msg) => send({ type: "progress", message: msg }),
            diagTimeout, deadline
          )
          const nouveaux = totalInserts - avant
          if (nouveaux > 0) {
            send({ type: "progress", message: `  + ${nouveaux} en ${secteur} (total ${totalInserts})` })
          }
        }

        if (Date.now() >= deadline) { prochaineCommune = ci; break }
        prochaineCommune = ci + 1
      }

      const termine = prochaineCommune >= COMMUNES.length
      if (!termine) {
        send({ type: "progress", message: `⏭️ Temps écoulé — reprise à ${COMMUNES[prochaineCommune]} au clic suivant.` })
      }
      send({
        type: "done",
        totalInserts,
        termine,
        communeStart: termine ? 0 : prochaineCommune,
        prochaineCommune: termine ? null : COMMUNES[prochaineCommune] ?? null,
      })
    } catch (err) {
      send({ type: "error", message: String(err), totalInserts })
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
