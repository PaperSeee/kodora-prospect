export type DiagnosticFlag =
  | "AUCUN_SITE"
  | "SITE_INACCESSIBLE"
  | `SITE_HS_${number}`
  | "SITE_LENT"
  | "PAS_MOBILE"
  | `SITE_DATE_${number}`

export interface DiagnosticResult {
  flags: DiagnosticFlag[]
  loadTimeMs?: number
  statusCode?: number
  // Entreprises qui achètent des annonces Google sur les mots-clés du
  // prospect, dans sa commune — c'est le signal qui compte pour l'offre
  // Ads (contrairement à HTTPS/mobile/vitesse, pertinents pour l'offre
  // site vitrine). Vide tant qu'aucune source n'est branchée : ni le
  // Keyword Planner, ni un scraping de la page de résultats Google ne
  // sont implémentés — mieux vaut un tableau vide (utilise le repli de
  // l'email 1) que des noms de concurrents inventés.
  concurrentsPayants: string[]
}

export async function diagnoseSite(
  siteWeb?: string | null,
  timeoutMs = 10000,
): Promise<DiagnosticResult> {
  if (!siteWeb) return { flags: ["AUCUN_SITE"], concurrentsPayants: [] }

  const url = siteWeb.startsWith("http") ? siteWeb : `https://${siteWeb}`
  const flags: DiagnosticFlag[] = []
  // TODO: brancher Keyword Planner ou un scraping SERP pour peupler ce
  // champ — voir le commentaire sur DiagnosticResult.concurrentsPayants.
  const concurrentsPayants: string[] = []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KodoraBot/1.0)" },
      redirect: "follow",
    })
    clearTimeout(timeout)
    const loadTimeMs = Date.now() - start

    if (!res.ok) {
      flags.push(`SITE_HS_${res.status}` as DiagnosticFlag)
      return { flags, loadTimeMs, statusCode: res.status, concurrentsPayants }
    }

    if (loadTimeMs > 4000) flags.push("SITE_LENT")

    const html = await res.text()

    // Responsive mobile
    if (!html.includes("width=device-width")) flags.push("PAS_MOBILE")

    // Année dans le footer/copyright
    const yearMatches = html.match(/(?:copyright|©|&copy;)[\s\S]{0,50}?(20\d{2})/i)
    if (yearMatches) {
      const year = parseInt(yearMatches[1], 10)
      const currentYear = new Date().getFullYear()
      if (currentYear - year >= 3) flags.push(`SITE_DATE_${year}` as DiagnosticFlag)
    }

    return { flags, loadTimeMs, statusCode: res.status, concurrentsPayants }
  } catch {
    clearTimeout(timeout)
    flags.push("SITE_INACCESSIBLE")
    return { flags, concurrentsPayants }
  }
}
