// ── Configuration du pipeline auto de prospection ──
//
// Garde-fous délibérés pour protéger la délivrabilité et le domaine.
// 100 cold emails/jour dès un domaine neuf = spam + blacklist garantis.
// On démarre bas et on monte progressivement (warm-up).

// Secteurs sourcés en rotation (un sous-ensemble différent chaque jour
// évite de re-scraper toujours les mêmes et épuiser un secteur).
export const SECTEURS_ROTATION: string[][] = [
  ["avocat", "notaire", "comptable"],
  ["fiduciaire", "architecte", "dentiste"],
  ["kinésithérapeute", "ostéopathe", "vétérinaire"],
  ["photographe", "agence immobilière", "courtier en assurance"],
  ["coach", "traiteur", "salon de coiffure"],
  ["institut de beauté", "menuisier", "électricien"],
]

// Villes ciblées (rotation simple aussi).
export const VILLES_ROTATION = ["Bruxelles", "Liège", "Namur", "Charleroi", "Gand", "Anvers"]

// Nb de prospects sourcés par secteur à chaque run.
export const MAX_PAR_SECTEUR = 12

// ── RAMP D'ENVOI ──
// Plafond d'emails envoyés par jour, qui augmente avec l'âge du programme.
// jour 1-7 : 20  /  semaine 2 : 35  /  semaine 3 : 55  /  semaine 4 : 75  /  ensuite : 90 (max)
const RAMP: { afterDays: number; cap: number }[] = [
  { afterDays: 0, cap: 20 },
  { afterDays: 7, cap: 35 },
  { afterDays: 14, cap: 55 },
  { afterDays: 21, cap: 75 },
  { afterDays: 28, cap: 90 },
]

// Plafond du jour, calculé d'après le nombre de jours depuis le 1er run.
export function dailyCap(daysSinceStart: number): number {
  let cap = RAMP[0].cap
  for (const step of RAMP) {
    if (daysSinceStart >= step.afterDays) cap = step.cap
  }
  return cap
}

// Délai aléatoire (ms) entre deux envois — imite un humain, évite les bursts.
// Court par défaut pour tenir dans la limite 60s de Vercel Hobby.
// (Sur un cron qui tourne plusieurs fois/jour en Pro, on pourrait l'allonger.)
export function jitterDelay(): number {
  // entre 1,5s et 4s
  return 1500 + Math.floor(Math.random() * 2500)
}

// Budget temps (ms) max d'un run, pour rester sous la limite Vercel Hobby (60s).
// On arrête proprement l'envoi avant le timeout — le reste partira au prochain run.
export const RUN_TIME_BUDGET_MS = 50_000
