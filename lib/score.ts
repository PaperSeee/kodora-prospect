import type { DiagnosticFlag } from "./diagnose"

export interface ScoreResult {
  score: number
  angle: string
  goldStar: boolean
}

export function scoreProspect(
  flags: DiagnosticFlag[],
  avis?: number | null,
  note?: number | null
): ScoreResult {
  let score = 0
  let angle = "Site à améliorer"
  let goldStar = false

  const has = (f: string) => flags.some((fl) => fl === f || fl.startsWith(f))

  if (has("SITE_INACCESSIBLE") || has("SITE_HS_")) {
    score += 55
    angle = "Site en panne — il pense avoir une présence en ligne"
  }
  if (has("PAS_MOBILE")) {
    score += 45
    if (score < 45) angle = "Site cassé sur mobile"
  }
  if (has("AUCUN_SITE")) {
    score += 40
    angle = "Aucun site web"
  }
  if (has("SITE_DATE_")) {
    score += 35
    if (!has("SITE_INACCESSIBLE") && !has("PAS_MOBILE") && !has("AUCUN_SITE"))
      angle = "Site vieillissant"
  }
  if (has("PAS_HTTPS")) {
    score += 30
    if (score <= 30) angle = "Pas de HTTPS — site non sécurisé"
  }
  if (has("SITE_LENT")) {
    score += 25
    if (score <= 25) angle = "Site trop lent"
  }

  // Bonus avis
  const a = avis ?? 0
  if (a >= 50) score += 25
  else if (a >= 20) score += 15
  else if (a >= 5) score += 8

  // Bonus note + avis
  if (note && note >= 4.5 && a >= 10) score += 12

  // Combo or : site pourri + ≥ 20 avis
  const sitePourri = has("PAS_MOBILE") || has("SITE_INACCESSIBLE") || has("SITE_HS_") || has("SITE_DATE_")
  if (sitePourri && a >= 20) {
    score += 15
    goldStar = true
    angle = `⭐ Cible en or — ${angle.replace("⭐ ", "")} + ${a} avis`
  }

  return { score: Math.min(score, 100), angle, goldStar }
}
