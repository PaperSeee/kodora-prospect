// ── Configuration du pipeline auto de prospection ──
//
// Garde-fous délibérés pour protéger la délivrabilité et le domaine.
// 100 cold emails/jour dès un domaine neuf = spam + blacklist garantis.
// On démarre bas et on monte progressivement (warm-up).

// Secteurs sourcés en rotation (un sous-ensemble différent chaque jour
// évite de re-scraper toujours les mêmes et épuiser un secteur).
// Rotation recalibrée le 2026-07-05 sur les données réelles de conversion
// (2 579 prospects, ~1 200 contactés). Taux de lead chaud mesurés :
//   comptable 27% · avocat 26% · photographe 25% · traiteur 19% ·
//   notaire 15% · chauffagiste 15% · restaurant 14% · vétérinaire 14%
// Sortis de la rotation (mesurés morts) : dentiste 1,5%, architecte 3,6%,
// ostéopathe 3,3%, menuisier 4,8% (+5 désabos), électricien 5,1%,
// serrurier/maçon/carreleur/couvreur 0%. Pattern : les professions de bureau
// et les métiers d'image convertissent ; les artisans de chantier, non.
export const SECTEURS_ROTATION: string[][] = [
  ["comptable", "avocat", "photographe"],
  ["notaire", "traiteur", "vétérinaire"],
  ["fiduciaire", "restaurant", "chauffagiste"],
  ["comptable", "avocat", "courtier en assurance"],
  ["photographe", "traiteur", "opticien"],
  ["notaire", "coach", "fleuriste"],
]

// Relances J+3 : actives, mais UNIQUEMENT pour les prospects contactés à
// partir du début de la nouvelle campagne. Les contacts historiques
// (anciennes campagnes) ne reçoivent plus jamais rien — ni mail initial
// (statut "contacte" = exclu de la file), ni relance (plancher de date).
// 1 relance max par prospect, jamais plus (flag relancee).
export const RELANCES_ACTIVES = true
export const RELANCES_SEULEMENT_APRES = new Date("2026-07-04")

// Secteurs dont la conversion mesurée est forte : bonus de score au sourcing
// pour qu'ils passent en tête de la file d'envoi (le pipeline envoie par
// score décroissant).
export const SECTEURS_PRIORITAIRES = new Set([
  "comptable", "avocat", "photographe", "traiteur",
  "notaire", "chauffagiste", "restaurant", "vétérinaire",
])

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
