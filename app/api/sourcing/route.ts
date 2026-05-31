import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { diagnoseSite } from "@/lib/diagnose"
import { scoreProspect } from "@/lib/score"

const SECTEURS = [
  "avocat", "notaire", "comptable", "fiduciaire", "architecte",
  "dentiste", "kinésithérapeute", "ostéopathe", "vétérinaire",
  "photographe", "agence immobilière", "courtier en assurance",
  "coach", "traiteur", "salon de coiffure", "institut de beauté",
  "menuisier", "électricien",
]

export { SECTEURS }

interface PlaceResult {
  nom: string
  secteur: string
  ville: string
  telephone?: string
  siteWeb?: string
  email?: string
  note?: number
  avis?: number
}

async function fetchGooglePlaces(
  secteur: string,
  ville: string,
  maxResults: number
): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return []

  const query = `${secteur} ${ville}`
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=fr&key=${key}`

  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  if (!data.results?.length) return []

  const results: PlaceResult[] = []
  for (const place of data.results.slice(0, maxResults)) {
    // Détails pour téléphone + site
    let telephone: string | undefined
    let siteWeb: string | undefined
    try {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number,website,editorial_summary&key=${key}`
      const detailRes = await fetch(detailUrl)
      if (detailRes.ok) {
        const detail = await detailRes.json()
        telephone = detail.result?.formatted_phone_number
        siteWeb = detail.result?.website
      }
    } catch {}

    results.push({
      nom: place.name,
      secteur,
      ville,
      telephone,
      siteWeb,
      note: place.rating,
      avis: place.user_ratings_total,
    })
  }
  return results
}

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

      let prospects: PlaceResult[] = []

      // Source principale : Google Places
      try {
        prospects = await fetchGooglePlaces(secteur, ville, maxParSecteur)
      } catch (err) {
        console.error("[sourcing] Google Places error:", err)
      }

      // Fallback Playwright si Places vide ou absent
      if (prospects.length === 0) {
        send({ type: "progress", message: `Fallback scraper pour : ${secteur}...` })
        try {
          const { scrapeGoogleMaps } = await import("@/lib/scraper-fallback")
          prospects = await scrapeGoogleMaps(secteur, ville, maxParSecteur)
        } catch (err) {
          console.error("[sourcing] Scraper fallback error:", err)
        }
      }

      send({ type: "progress", message: `${prospects.length} résultats pour ${secteur}, diagnostic en cours...` })

      for (const p of prospects) {
        // Déduplique : ignore si déjà en base
        const existing = await prisma.prospect.findFirst({
          where: { nom: p.nom, ville: p.ville },
        })
        if (existing) continue

        // Plateformes tierces — pas un vrai site perso, on ignore
        const PLATEFORMES = [
          "doctoranytime", "zocdoc", "practo", "livi", "qare",
          "facebook.com", "instagram.com", "linkedin.com",
          "pages.google.com", "google.com/maps",
          "yelp.com", "tripadvisor", "booking.com",
          "trustedshops", "doctoralia", "onemedical",
        ]
        const estPlateforme = p.siteWeb
          ? PLATEFORMES.some(p2 => p.siteWeb!.toLowerCase().includes(p2))
          : false

        const siteWebReel = estPlateforme ? undefined : p.siteWeb

        // Diagnostic
        const diag = await diagnoseSite(siteWebReel)

        // Extraction email : priorité site web réel uniquement
        const { extractEmailFromSite } = await import("@/lib/extract-email")
        let emailTrouve: string | null = p.email ?? null
        if (!emailTrouve && siteWebReel) {
          emailTrouve = await extractEmailFromSite(siteWebReel)
        }

        // Score
        const { score, angle, goldStar } = scoreProspect(diag.flags, p.avis, p.note)

        await prisma.prospect.create({
          data: {
            nom: p.nom,
            secteur: p.secteur,
            ville: p.ville,
            telephone: p.telephone,
            email: emailTrouve ?? undefined,
            siteWeb: siteWebReel,
            note: p.note,
            avis: p.avis,
            diagnostic: JSON.stringify(diag),
            score,
            angle,
            goldStar,
            statut: "a_contacter",
          },
        })
        totalInserts++
      }
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
