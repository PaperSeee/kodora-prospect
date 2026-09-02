// ── Configuration du pipeline auto de prospection ──
//
// Garde-fous délibérés pour protéger la délivrabilité et le domaine.
// 100 cold emails/jour dès un domaine neuf = spam + blacklist garantis.
// On démarre bas et on monte progressivement (warm-up).

// Secteurs sourcés en rotation (un sous-ensemble différent chaque jour
// évite de re-scraper toujours les mêmes et épuiser un secteur).
//
// ⚠️ RETARGETÉ le 2026-09-02 pour le pivot Google Ads (growth operator).
// Les taux "LEAD CHAUD" mesurés le 2026-08-03 (comptable 33%, photographe
// 28%, avocat 20%...) mesuraient la conversion sur l'ANCIENNE offre — site
// vitrine à 299€. Ils ne disent rien de la conversion sur l'offre Ads,
// et ne doivent plus servir de boussole : un bon prospect Ads n'est pas
// "il n'a pas de beau site", c'est "chez lui, la recherche est urgente et
// la personne appelle le premier numéro qu'elle voit" — l'argument central
// de la séquence email (voir lib/email-templates.ts). Ça exclut par
// construction les professions de bureau (comptable, avocat, notaire) où
// personne ne cherche "avocat urgence" un dimanche soir, et ça inclut les
// métiers d'urgence que le backup 2026-08-03 avait classés "morts" pour
// l'ancienne offre (serrurier 0%, artisans de chantier 0%) — un chiffre
// qui mesurait le mauvais produit, pas le mauvais secteur.
//
// Repose sur lib/source-overpass.ts::SECTEUR_OSM pour le sourcing gratuit
// (fallback sans clé Google Places) — débouchage, serrurier, vitrier,
// dégâts des eaux, humidité, nuisibles y sont mappés depuis ce même commit.
export const SECTEURS_ROTATION: string[][] = [
  ["débouchage", "serrurier", "vitrier"],
  ["électricien", "chauffagiste", "plombier"],
  ["dégâts des eaux", "nuisibles", "humidité"],
  ["débouchage", "vitrier", "chauffagiste"],
  ["serrurier", "électricien", "plombier"],
  ["débouchage", "nuisibles", "dégâts des eaux"],
]

// Séquence de suivi réactivée le 2026-09-02, sur un nouveau principe :
// chaque message apporte une information neuve et autonome (value ladder),
// aucun ne dit "je me permets de revenir vers vous". 4 messages, espacés
// J0 → J+3 → J+7 → J+12. Toute réponse arrête la séquence immédiatement
// (voir pipeline/run/route.ts, qui ne retouche jamais un prospect a_repondu).
export const RELANCES_ACTIVES = true
export const SEQUENCE_DELAIS_JOURS = [3, 7, 12] // délai depuis le PRÉCÉDENT message de la séquence
export const RELANCES_SEULEMENT_APRES = new Date("2026-09-02")

// Secteurs dont la conversion mesurée est forte : bonus de score au sourcing
// pour qu'ils passent en tête de la file d'envoi (le pipeline envoie par
// score décroissant).
//
// Vidé le 2026-09-02 : les anciens taux (comptable 33%, photographe 28%...)
// mesuraient la conversion sur l'offre site vitrine, périmés pour l'offre
// Ads. Pas de nouvelles données mesurées sur les métiers d'urgence — plutôt
// qu'inventer une hiérarchie sans preuve, le bonus reste neutre (aucun
// secteur favorisé) tant qu'un vrai backup n'a pas tourné sur la nouvelle
// rotation. Rebrancher une fois 2-3 semaines de données réelles disponibles.
export const SECTEURS_PRIORITAIRES = new Set<string>([])

// Communes ciblées, par ordre de priorité. On commence par Bruxelles (plus gros
// marché) ; quand un secteur y est épuisé, le pipeline passe automatiquement à
// la commune suivante (Ixelles, Schaerbeek, Forest…) pour trouver du nouveau.
export const COMMUNES = [
  "Bruxelles",
  "Ixelles",
  "Schaerbeek",
  "Anderlecht",
  "Molenbeek-Saint-Jean",
  "Saint-Gilles",
  "Uccle",
  "Forest",
  "Etterbeek",
  "Woluwe-Saint-Lambert",
  "Woluwe-Saint-Pierre",
  "Jette",
  "Auderghem",
  "Watermael-Boitsfort",
  "Saint-Josse-ten-Noode",
  "Koekelberg",
  "Berchem-Sainte-Agathe",
  "Ganshoren",
  "Evere",
]

// Nb de prospects sourcés par secteur à chaque run.
export const MAX_PAR_SECTEUR = 10

// Objectif de NOUVEAUX prospects à sourcer par run : on vise à reconstituer le
// stock pour couvrir le plafond d'envoi du jour (+ une petite marge). Calculé
// dynamiquement depuis le cap du ramp — voir objectifSourcing().
export function objectifSourcing(capDuJour: number): number {
  return capDuJour + 10 // marge pour absorber doublons / prospects sans email
}

// Nb max de tentatives (secteur × commune) en un run, garde-fou si tout est
// quasi vide. Généreux car on vise jusqu'à ~50 prospects sur plusieurs communes.
// Borné de toute façon par le budget temps (60s Hobby).
export const MAX_TENTATIVES_PAR_RUN = 30

// Timeout de diagnostic par site pendant le pipeline auto (court, pour tenir
// dans les 60s). La route SSE manuelle garde le défaut plus généreux (10s).
export const DIAG_TIMEOUT_PIPELINE_MS = 4000

// ── RAMP D'ENVOI ──
// Plafond d'emails envoyés par jour, qui augmente AUTOMATIQUEMENT avec l'âge du
// programme (warm-up). Objectif final : 50/jour.
// jour 1-7 : 20  /  semaine 2 : 30  /  semaine 3 : 40  /  ensuite : 50 (max)
const RAMP: { afterDays: number; cap: number }[] = [
  { afterDays: 0, cap: 20 },
  { afterDays: 7, cap: 30 },
  { afterDays: 14, cap: 40 },
  { afterDays: 21, cap: 50 },
]

// Plafond du jour, calculé d'après le nombre de jours depuis le 1er run.
export function dailyCap(daysSinceStart: number): number {
  let cap = RAMP[0].cap
  for (const step of RAMP) {
    if (daysSinceStart >= step.afterDays) cap = step.cap
  }
  return cap
}

// Délai aléatoire (ms) entre deux envois — petit jitter pour éviter les bursts
// parfaitement réguliers, mais court pour tenir dans les 45s de budget Hobby :
// ~0,3-0,7s/email → permet ~50 envois par run. Brevo gère ce rythme sans souci.
export function jitterDelay(): number {
  // entre 0,3s et 0,7s
  return 300 + Math.floor(Math.random() * 400)
}

// Budget temps (ms) max d'un run, pour rester sous la limite Vercel Hobby (60s).
// 52s laisse de la marge ; avec ~0,3-0,7s/email ça couvre largement 50 envois.
// On arrête proprement l'envoi avant le timeout — le reste partira au prochain run.
export const RUN_TIME_BUDGET_MS = 52_000
