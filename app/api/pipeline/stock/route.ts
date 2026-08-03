import { NextRequest, NextResponse } from "next/server"
import { sourceSecteur } from "@/lib/source-prospects"
import { generateEmailBatch } from "@/lib/generate-emails"
import { prisma } from "@/lib/prisma"
import {
  SECTEURS_ROTATION,
  COMMUNES,
  MAX_PAR_SECTEUR,
  DIAG_TIMEOUT_PIPELINE_MS,
  RUN_TIME_BUDGET_MS,
} from "@/lib/pipeline-config"

// Bouton "Préparer un gros stock" : source à travers les communes + génère les
// emails, en streaming (SSE).
//
// ── Pourquoi un budget temps ──
// Sur Vercel Hobby la fonction est TUÉE à 60s. Un sourcing de 200 prospects
// (Overpass + diagnostic + extraction email, tout séquentiel) dépasse largement
// ce budget : la fonction mourait avant d'avoir dépassé Bruxelles (1re commune),
// le flux SSE se coupait, et le bouton restait bloqué sur "Préparation…".
//
// On borne donc chaque run à RUN_TIME_BUDGET_MS et on ratisse les communes DANS
// L'ORDRE à partir d'un curseur (`communeStart`) fourni par le client. Quand le
// temps est écoulé, on rend proprement un `done` avec le curseur suivant et le
// client relance automatiquement là où on s'est arrêté. Le sourcing est
// idempotent (dédup nom+ville), donc reprendre est sans risque.
//
// Body: { objectif?: number, communeStart?: number }

export const maxDuration = 60 // Vercel Hobby : plafond réel. Le budget temps
                              // ci-dessous (52s) garde une marge sous ce plafond.

// Borne haute alignée sur le slider de l'UI.
const OBJECTIF_MAX = 300

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const objectif: number = Math.min(Math.max(Number(body.objectif) || 100, 1), OBJECTIF_MAX)
  // Curseur de reprise : index de la commune où (re)commencer.
  const communeStart: number = Math.min(
    Math.max(Number(body.communeStart) || 0, 0),
    COMMUNES.length - 1
  )

  const deadline = Date.now() + RUN_TIME_BUDGET_MS

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
    let sourced = 0
    let generated = 0
    // Curseur atteint : par défaut on considère la liste finie (mis à jour dès
    // qu'on doit s'arrêter en cours de route par manque de temps).
    let prochaineCommune = COMMUNES.length

    try {
      const tousSecteurs = [...new Set(SECTEURS_ROTATION.flat())]

      send({
        type: "progress",
        message: `Objectif : ${objectif} prospects — sourcing à partir de ${COMMUNES[communeStart]}...`,
      })

      // 1. SOURCING — commune par commune, en s'arrêtant avant le timeout.
      for (let ci = communeStart; ci < COMMUNES.length; ci++) {
        const commune = COMMUNES[ci]

        if (sourced >= objectif) { prochaineCommune = ci; break }
        // Plus assez de temps pour attaquer une nouvelle commune proprement :
        // on reprendra ici au prochain clic.
        if (Date.now() >= deadline) { prochaineCommune = ci; break }

        send({ type: "progress", message: `📍 Commune : ${commune}` })

        for (const secteur of tousSecteurs) {
          if (sourced >= objectif) break
          if (Date.now() >= deadline) break

          const avant = sourced
          // Diagnostic court (4s) pour caser plus de prospects dans le budget.
          sourced += await sourceSecteur(
            secteur,
            commune,
            MAX_PAR_SECTEUR,
            undefined,
            DIAG_TIMEOUT_PIPELINE_MS,
            deadline
          )
          const nouveaux = sourced - avant
          if (nouveaux > 0) {
            send({ type: "progress", message: `  + ${nouveaux} en ${secteur} (${sourced}/${objectif})` })
          }
        }

        // Si on sort de la commune uniquement par manque de temps (pas fini les
        // secteurs), on reprendra CETTE commune au prochain run.
        if (Date.now() >= deadline && sourced < objectif) { prochaineCommune = ci; break }
        // Commune terminée : la suivante sera le point de reprise.
        prochaineCommune = ci + 1
      }

      // 2. GÉNÉRATION — emails pour le stock à contacter, tant qu'il reste du
      // budget temps (sinon le cron /api/cron/generate finira le matin).
      if (Date.now() < deadline) {
        send({ type: "progress", message: `Sourcing de ce run fini (${sourced}). Génération des emails...` })
        while (Date.now() < deadline) {
          const count = await generateEmailBatch({ take: 10 })
          if (!count) break
          generated += count
          send({ type: "progress", message: `  ✍️ ${generated} emails générés...` })
        }
      }

      const stockPret = await prisma.prospect.count({
        where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
      })

      // Reste-t-il des communes à ratisser ET l'objectif n'est pas atteint ?
      const termine = prochaineCommune >= COMMUNES.length || sourced >= objectif

      send({
        type: "done",
        sourced,
        generated,
        stockPret,
        termine,
        // Curseur pour le clic suivant si non terminé.
        communeStart: termine ? 0 : prochaineCommune,
        prochaineCommune: termine ? null : COMMUNES[prochaineCommune] ?? null,
      })
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
