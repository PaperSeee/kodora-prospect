// Filtrage des vues non humaines pour le tracking d'audit (voir audit KPI
// du 2026-09-01). Deux signaux indépendants, combinés en "ce n'est
// probablement pas un humain" :
//
//   1. User-agent connu comme scanner de sécurité d'entreprise — ces
//      produits ouvrent (et parfois cliquent) chaque lien d'un email
//      automatiquement, avant même que le destinataire ne le voie.
//   2. Vue survenant < 30s après l'événement "delivered" du même envoi —
//      aucun humain ne lit un email et clique un lien en moins de 30
//      secondes ; c'est la signature d'un scan automatique.
//
// Un des deux suffit à disqualifier la vue comme "humaine".

const BOT_USER_AGENT_PATTERNS: RegExp[] = [
  /Microsoft Office/i, // Outlook Safe Links / ATP
  /OutlookSafeLinks|Outlook-.*SafeLinks|SafeLinks/i,
  /BarracudaSentinel|Barracuda/i,
  /Proofpoint|PPS-Link|pp-link/i,
  /Mimecast/i,
  /bot|crawler|spider|preview|scanner|monitor/i,
  /Googlebot|bingbot|Slackbot|facebookexternalhit|WhatsApp/i,
  /curl|wget|python-requests|axios\/|node-fetch/i,
]

export function isLikelyBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false // absence d'UA : on ne peut pas conclure sur ce seul signal
  return BOT_USER_AGENT_PATTERNS.some((re) => re.test(userAgent))
}

export const SCANNER_DELAY_THRESHOLD_MS = 30_000

// Vrai si `viewedAt` tombe dans les 30s suivant `deliveredAt` — trop tôt
// pour qu'un humain ait ouvert l'email et cliqué.
export function isWithinScannerWindow(deliveredAt: Date | null, viewedAt: Date): boolean {
  if (!deliveredAt) return false
  const delta = viewedAt.getTime() - deliveredAt.getTime()
  return delta >= 0 && delta < SCANNER_DELAY_THRESHOLD_MS
}
