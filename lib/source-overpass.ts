import type { PlaceResult } from "@/lib/source-prospects"

// ── Sourcing gratuit via OpenStreetMap (Overpass API) ──
//
// Aucune clé, aucun quota payant. Deux appels par (secteur, ville) :
//   1. Nominatim géocode la commune → bounding box (mise en cache)
//   2. Overpass liste les commerces/professions taggés dans cette bbox
//
// Bonus vs Google Places : OSM expose parfois directement l'email
// (tag contact:email), que Places ne donne jamais.
//
// Politesse imposée par les CGU de ces services publics : User-Agent
// identifiable et ≥ 1s entre deux requêtes Nominatim.

const UA = "KodoraProspect/1.0 (prospection locale; contact: contact@kodora.eu)"

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
]

// Secteur métier → filtres de tags OSM. Plusieurs filtres = union (OR).
// Réf. : https://wiki.openstreetmap.org/wiki/Map_features
const SECTEUR_OSM: Record<string, string[]> = {
  "avocat": ['["office"="lawyer"]'],
  "notaire": ['["office"="notary"]'],
  "comptable": ['["office"="accountant"]'],
  "fiduciaire": ['["office"="accountant"]'],
  "architecte": ['["office"="architect"]'],
  "dentiste": ['["amenity"="dentist"]'],
  "kinésithérapeute": ['["healthcare"="physiotherapist"]'],
  "ostéopathe": ['["healthcare"~"osteopath"]', '["healthcare:speciality"~"osteopathy"]'],
  "vétérinaire": ['["amenity"="veterinary"]'],
  "photographe": ['["craft"="photographer"]', '["shop"="photo"]'],
  "agence immobilière": ['["office"="estate_agent"]'],
  "courtier en assurance": ['["office"="insurance"]'],
  "coach": ['["office"="coaching"]'],
  "traiteur": ['["craft"="caterer"]'],
  "salon de coiffure": ['["shop"="hairdresser"]'],
  "institut de beauté": ['["shop"="beauty"]'],
  "menuisier": ['["craft"~"carpenter|joiner"]'],
  "électricien": ['["craft"="electrician"]'],
  // Secteurs bonus fréquents en prospection locale
  "plombier": ['["craft"="plumber"]'],
  "chauffagiste": ['["craft"="hvac"]', '["craft"="plumber"]["plumber:heating"!="no"]'],
  "garagiste": ['["shop"="car_repair"]'],
  "boulangerie": ['["shop"="bakery"]'],
  "restaurant": ['["amenity"="restaurant"]'],
  "opticien": ['["shop"="optician"]'],
  "pharmacie": ['["amenity"="pharmacy"]'],
  "fleuriste": ['["shop"="florist"]'],
  "toiletteur": ['["shop"="pet_grooming"]'],
  "auto-école": ['["amenity"="driving_school"]'],
  // Métiers d'urgence — ajoutés le 2026-09-02 pour le pivot Google Ads
  // (voir lib/pipeline-config.ts). "débouchage" et "dégâts des eaux"
  // n'ont pas de tag OSM dédié : ce sont des services de plombier
  // spécialisés, réutilisent donc le tag "plombier" existant.
  "débouchage": ['["craft"="plumber"]'],
  "serrurier": ['["shop"="locksmith"]', '["craft"="locksmith"]'],
  "vitrier": ['["craft"="glaziery"]', '["shop"="glaziery"]'],
  "dégâts des eaux": ['["craft"="plumber"]'],
  "humidité": ['["craft"="plumber"]'],
  "nuisibles": ['["craft"="pest_control"]', '["office"="pest_control"]'],
  // "gouttières" n'a pas de tag OSM dédié (vérifié le 2026-09-15 : aucun
  // craft="gutter_cleaning" en usage réel, 0 résultat testé sur Bruxelles) —
  // proxy sur "couvreur" (craft=roofer), métier plus large qui couvre aussi
  // le nettoyage/réparation de gouttières en pratique. Moins précis que les
  // autres secteurs de cette table : à remplacer si une source dédiée
  // apparaît (annuaire pro, Google Places).
  "couvreur": ['["craft"="roofer"]'],
}

// bbox Nominatim par ville, en cache pour la durée du process.
const bboxCache = new Map<string, [string, string, string, string]>()
let lastNominatimCall = 0

async function geocodeVille(ville: string): Promise<[string, string, string, string] | null> {
  const cached = bboxCache.get(ville)
  if (cached) return cached

  // Rate limit Nominatim : max 1 req/s
  const wait = 1100 - (Date.now() - lastNominatimCall)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatimCall = Date.now()

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ville)}&countrycodes=be&format=jsonv2&limit=1`
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) return null
  const data = await res.json()
  const box = data?.[0]?.boundingbox as [string, string, string, string] | undefined
  if (!box) return null

  bboxCache.set(ville, box)
  return box
}

export async function fetchOverpass(
  secteur: string,
  ville: string,
  maxResults: number,
  deadline?: number
): Promise<PlaceResult[]> {
  const filters = SECTEUR_OSM[secteur.toLowerCase().trim()]
  if (!filters) {
    console.warn(`[overpass] secteur inconnu "${secteur}" — ajoutez-le dans SECTEUR_OSM`)
    return []
  }

  const box = await geocodeVille(ville)
  if (!box) {
    console.warn(`[overpass] ville introuvable sur Nominatim : ${ville}`)
    return []
  }
  // Nominatim renvoie [sud, nord, ouest, est] ; Overpass attend (sud,ouest,nord,est)
  const [s, n, w, e] = box
  const bbox = `${s},${w},${n},${e}`

  const union = filters.map((f) => `nwr${f}(${bbox});`).join("\n  ")
  const query = `[out:json][timeout:25];
(
  ${union}
);
out tags center ${Math.max(maxResults * 3, 30)};`

  // Un miroir peut renvoyer 429/504 (rate limit/timeout) : on essaie les miroirs
  // suivants. On évite les longues pauses de retry qui, cumulées sur plusieurs
  // secteurs, faisaient exploser le budget temps d'un run (et bloquaient l'UI).
  // Chaque requête a son propre timeout, et on s'arrête si la deadline du run
  // approche plutôt que d'insister.
  const tempsRestant = () => (deadline ? deadline - Date.now() : Infinity)
  let elements: Array<{ tags?: Record<string, string> }> | null = null
  for (const mirror of OVERPASS_MIRRORS) {
    if (tempsRestant() < 6000) break // pas le temps pour un autre miroir : on rend la main
    try {
      const ctrl = new AbortController()
      // Timeout par requête : min(temps restant - marge, 25s)
      const budget = Math.min(Math.max(tempsRestant() - 2000, 3000), 25000)
      const to = setTimeout(() => ctrl.abort(), budget)
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      })
      clearTimeout(to)
      if (!res.ok) {
        console.warn(`[overpass] ${new URL(mirror).host} → HTTP ${res.status} (${secteur} @ ${ville})`)
        continue
      }
      const data = await res.json()
      elements = data?.elements ?? []
      break
    } catch (err) {
      console.warn(`[overpass] ${new URL(mirror).host} injoignable :`, String(err).slice(0, 100))
    }
  }
  if (elements === null) {
    console.warn(`[overpass] tous les miroirs ont échoué pour ${secteur} @ ${ville}`)
    elements = []
  }

  const seen = new Set<string>()
  const all: PlaceResult[] = []
  for (const el of elements) {
    const t = el.tags ?? {}
    const nom = t.name
    if (!nom) continue
    const key = nom.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    all.push({
      nom,
      secteur,
      ville,
      telephone: t.phone ?? t["contact:phone"] ?? undefined,
      siteWeb: t.website ?? t["contact:website"] ?? undefined,
      email: t.email ?? t["contact:email"] ?? undefined,
      // OSM n'a pas de note/avis : scoreProspect gère leur absence.
    })
  }

  // Un prospect sans email NI site est inexploitable en cold email :
  // on sert d'abord ceux qui ont un email direct, puis un site (dont
  // extractEmailFromSite pourra tirer une adresse), puis le reste.
  const joignabilite = (p: PlaceResult) => (p.email ? 2 : 0) + (p.siteWeb ? 1 : 0)
  all.sort((a, b) => joignabilite(b) - joignabilite(a))

  return all.slice(0, maxResults)
}
