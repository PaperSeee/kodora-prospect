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
  maxResults: number,
  deadline?: number
): Promise<PlaceResult[]> {
  const token = process.env.APIFY_API_TOKEN
  if (!token) return []

  // La route appelante (/api/sourcing) est plafonnée à 60s (Vercel Hobby,
  // voir maxDuration dans route.ts) — sans respecter la deadline du run
  // comme fetchOverpass le fait déjà, un run-sync Apify de 60-90s se ferait
  // tuer par Vercel AVANT de répondre, sans jamais logger d'erreur (constaté
  // en prod le 2026-09-15 : la progression restait bloquée sur "Sourcing
  // Apify..." sans suite). Le budget est le temps restant avant deadline
  // moins une marge, plafonné à 20s dans tous les cas — largement suffisant
  // pour maxCrawledPlacesPerSearch=10, et on préfère 0 résultat propre à un
  // hang qui casse tout le run.
  const tempsRestant = deadline ? deadline - Date.now() : 20_000
  if (tempsRestant < 8000) return [] // pas le temps de lancer un run Apify utile

  const budgetMs = Math.min(Math.max(tempsRestant - 3000, 5000), 20_000)

  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=${Math.floor(budgetMs / 1000)}`
  const body = {
    searchStringsArray: [`${secteur} ${ville}`],
    maxCrawledPlacesPerSearch: maxResults,
    language: "fr",
    countryCode: "be",
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(budgetMs),
    })
  } catch (err) {
    console.error(`[apify] fetch a expiré ou échoué (budget ${budgetMs}ms) :`, err)
    return []
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    console.error(`[apify] réponse ${res.status} : ${text.slice(0, 300)}`)
    return []
  }

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
