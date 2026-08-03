import { prisma } from "@/lib/prisma"
import { diagnoseSite } from "@/lib/diagnose"
import { scoreProspect } from "@/lib/score"
import { SECTEURS_PRIORITAIRES } from "@/lib/pipeline-config"

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
// Normalise la casse d'une commune ("jette" et "Jette" doivent être la MÊME
// ville, sinon la dédup crée des doublons — constaté dans le backup). Gère les
// noms composés à tirets (woluwe-saint-lambert → Woluwe-Saint-Lambert) et garde
// les particules en minuscule (Saint-Josse-ten-Noode), pour coller aux noms
// officiels des communes (constante COMMUNES).
const PARTICULES = new Set(["ten", "de", "la", "le", "sur", "aux", "au"])
function normaliserVille(ville: string): string {
  const parts = ville.trim().toLowerCase().split(/(\s|-)/) // garde les séparateurs
  return parts
    .map((part, i) => {
      if (!/^[a-zà-ÿ]/.test(part)) return part // séparateur
      if (i > 0 && PARTICULES.has(part)) return part // particule interne en minuscule
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join("")
}

export async function sourceSecteur(
  secteur: string,
  villeBrute: string,
  maxParSecteur: number,
  onProgress?: (msg: string) => void,
  diagTimeoutMs = 10000,
  deadline?: number
): Promise<number> {
  const ville = normaliserVille(villeBrute)
  let prospects: PlaceResult[] = []

  try {
    prospects = await fetchGooglePlaces(secteur, ville, maxParSecteur)
  } catch (err) {
    console.error("[sourcing] Google Places error:", err)
  }

  // Source gratuite (OpenStreetMap) : fonctionne sans aucune clé API.
  if (prospects.length === 0) {
    onProgress?.(`Sourcing OpenStreetMap (gratuit) pour : ${secteur}...`)
    try {
      const { fetchOverpass } = await import("@/lib/source-overpass")
      prospects = await fetchOverpass(secteur, ville, maxParSecteur, deadline)
    } catch (err) {
      console.error("[sourcing] Overpass error:", err)
    }
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

  const { extractEmailFromSite } = await import("@/lib/extract-email")

  // Traite un prospect : dédup, diagnostic, extraction email, insertion.
  // Retourne 1 si créé, 0 sinon. Les erreurs réseau ne cassent pas le lot.
  const traiter = async (p: PlaceResult): Promise<number> => {
    try {
      const existing = await prisma.prospect.findFirst({
        where: { nom: p.nom, ville: p.ville },
      })
      if (existing) return 0

      const estPlateforme = p.siteWeb
        ? PLATEFORMES.some((pf) => p.siteWeb!.toLowerCase().includes(pf))
        : false
      const siteWebReel = estPlateforme ? undefined : p.siteWeb

      // Diagnostic et extraction email visent le même site : on les lance en
      // parallèle (deux fetch concurrents plutôt que l'un après l'autre).
      const [diag, emailSite] = await Promise.all([
        diagnoseSite(siteWebReel, diagTimeoutMs),
        !p.email && siteWebReel ? extractEmailFromSite(siteWebReel) : Promise.resolve(null),
      ])
      const emailTrouve: string | null = p.email ?? emailSite ?? null

      let { score, angle, goldStar } = scoreProspect(diag.flags, p.avis, p.note)
      // Les secteurs qui convertissent le mieux (mesuré) passent en tête de la
      // file d'envoi : le pipeline envoie par score décroissant.
      if (SECTEURS_PRIORITAIRES.has(p.secteur.toLowerCase())) score = Math.min(score + 15, 100)

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
      return 1
    } catch (err) {
      console.error(`[sourcing] échec sur "${p.nom}" @ ${p.ville}:`, err)
      return 0
    }
  }

  // Les prospects sont indépendants et le travail est réseau (diagnostic +
  // email) : on les traite par vagues de CONCURRENCE en parallèle, ce qui rend
  // un lot ~N fois plus rapide qu'en séquentiel. On garde une borne pour ne pas
  // marteler les sites cibles ni saturer la base.
  const CONCURRENCE = 5
  let inserts = 0
  for (let i = 0; i < prospects.length; i += CONCURRENCE) {
    const lot = prospects.slice(i, i + CONCURRENCE)
    const res = await Promise.all(lot.map(traiter))
    inserts += res.reduce((a, b) => a + b, 0)
  }
  return inserts
}
