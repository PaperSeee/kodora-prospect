export interface ScrapedBusiness {
  nom: string
  secteur: string
  ville: string
  telephone?: string
  siteWeb?: string
  email?: string
  note?: number
  avis?: number
}

// Fallback HTTP-only (no browser) — uses Google Places Text Search API
// Requires GOOGLE_PLACES_API_KEY env var. Without it, returns empty array.
export async function scrapeGoogleMaps(
  secteur: string,
  ville: string,
  maxResults: number
): Promise<ScrapedBusiness[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn("[scraper-fallback] GOOGLE_PLACES_API_KEY manquante — sourcing impossible")
    return []
  }

  try {
    const query = `${secteur} ${ville}`
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=fr&region=be&key=${apiKey}`

    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()

    const places: ScrapedBusiness[] = []

    for (const place of (data.results ?? []).slice(0, maxResults)) {
      const business: ScrapedBusiness = {
        nom: place.name ?? "",
        secteur,
        ville,
        note: place.rating,
        avis: place.user_ratings_total,
      }

      // Fetch details for phone + website
      if (place.place_id) {
        try {
          const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number,website&language=fr&key=${apiKey}`
          const detailRes = await fetch(detailUrl)
          if (detailRes.ok) {
            const detail = await detailRes.json()
            business.telephone = detail.result?.formatted_phone_number
            business.siteWeb = detail.result?.website
          }
        } catch {
          // Details optional
        }
      }

      places.push(business)

      // Politeness delay between detail requests
      await new Promise((r) => setTimeout(r, 100))
    }

    return places
  } catch (err) {
    console.error("[scraper-fallback] Erreur:", err)
    return []
  }
}
