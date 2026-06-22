import { prisma } from "@/lib/prisma"
import { diagnoseSite } from "@/lib/diagnose"
import { scoreProspect } from "@/lib/score"

// Cœur du sourcing, partagé entre la route SSE (/api/sourcing) et
// l'orchestrateur du pipeline auto (/api/pipeline/run).

export interface PlaceResult {
  nom: string
  secteur: string
  ville: string
  telephone?: string
  siteWeb?: string
  email?: string
  note?: number
  avis?: number
}

const PLATEFORMES = [
  "doctoranytime", "zocdoc", "practo", "livi", "qare",
  "facebook.com", "instagram.com", "linkedin.com",
  "pages.google.com", "google.com/maps",
  "yelp.com", "tripadvisor", "booking.com",
  "trustedshops", "doctoralia", "onemedical",
]

export async function fetchGooglePlaces(
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

// Source un secteur, déduplique, diagnostique, score, et insère en base.
// Retourne le nombre de nouveaux prospects créés.
export async function sourceSecteur(
  secteur: string,
  ville: string,
  maxParSecteur: number,
  onProgress?: (msg: string) => void
): Promise<number> {
  let prospects: PlaceResult[] = []

  try {
    prospects = await fetchGooglePlaces(secteur, ville, maxParSecteur)
  } catch (err) {
    console.error("[sourcing] Google Places error:", err)
  }

  if (prospects.length === 0) {
    onProgress?.(`Fallback scraper pour : ${secteur}...`)
    try {
      const { scrapeGoogleMaps } = await import("@/lib/scraper-fallback")
      prospects = await scrapeGoogleMaps(secteur, ville, maxParSecteur)
    } catch (err) {
      console.error("[sourcing] Scraper fallback error:", err)
    }
  }

  onProgress?.(`${prospects.length} résultats pour ${secteur}, diagnostic...`)

  let inserts = 0
  for (const p of prospects) {
    const existing = await prisma.prospect.findFirst({
      where: { nom: p.nom, ville: p.ville },
    })
    if (existing) continue

    const estPlateforme = p.siteWeb
      ? PLATEFORMES.some((pf) => p.siteWeb!.toLowerCase().includes(pf))
      : false
    const siteWebReel = estPlateforme ? undefined : p.siteWeb

    const diag = await diagnoseSite(siteWebReel)

    const { extractEmailFromSite } = await import("@/lib/extract-email")
    let emailTrouve: string | null = p.email ?? null
    if (!emailTrouve && siteWebReel) {
      emailTrouve = await extractEmailFromSite(siteWebReel)
    }

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
    inserts++
  }
  return inserts
}
