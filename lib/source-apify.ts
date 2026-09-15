import type { PlaceResult } from "@/lib/source-prospects"

// ── Sourcing payant via Apify (Google Maps Scraper — compass/crawler-google-places) ──
//
// Ajouté le 2026-09-15 : secteurs mal couverts par OSM (aucun tag dédié, ou
// quasiment aucune entreprise du métier cartographiée en Belgique — constaté
// en prod pour "nuisibles", 0 résultat OSM sur toutes les communes, vérifié
// indépendamment via Overpass : 3 nœuds pest_control dans TOUTE la Belgique).
//
// Facturation à la fiche scrapée (~0,004$/fiche au palier de base) plutôt
// qu'à la requête comme l'API Google Places officielle — nettement moins
// cher pour un run ciblé sur un secteur précis. Requiert APIFY_API_TOKEN.
// Sans le token, retourne un tableau vide (même contrat que
// fetchGooglePlaces sans clé) : l'appelant retombe sur le fallback suivant.
//
// Actor utilisé : compass/crawler-google-places (39M+ runs, standard du
// secteur). Un seul appel synchrone par (secteur, ville) via
// run-sync-get-dataset-items, pas de polling à gérer côté appelant.

const ACTOR_ID = "compass~crawler-google-places"

interface ApifyPlace {
  title?: string
  phone?: string
  phoneUnformatted?: string
  website?: string
  totalScore?: number
  reviewsCount?: number
}

export async function fetchApifyGoogleMaps(
  secteur: string,
  ville: string,
  maxResults: number
): Promise<PlaceResult[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) return []

  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`
  const body = {
    searchStringsArray: [`${secteur} ${ville}`],
    maxCrawledPlacesPerSearch: maxResults,
    language: "fr",
    countryCode: "be",
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Le run synchrone peut prendre plusieurs dizaines de secondes (scraping
    // réel, pas une API instantanée) — budget généreux, appelé en dehors du
    // chemin critique de la route SSE (voir sourceSecteur, appelé après les
    // fallbacks gratuits qui ont déjà consommé du temps).
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) return []

  const items = (await res.json()) as ApifyPlace[]
  if (!Array.isArray(items) || items.length === 0) return []

  return items
    .filter((p) => p.title)
    .slice(0, maxResults)
    .map((p) => ({
      nom: p.title!,
      secteur,
      ville,
      telephone: p.phone ?? p.phoneUnformatted,
      siteWeb: p.website,
      note: p.totalScore,
      avis: p.reviewsCount,
    }))
}
