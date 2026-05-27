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
}

export async function diagnoseSite(siteWeb?: string | null): Promise<DiagnosticResult> {
  if (!siteWeb) return { flags: ["AUCUN_SITE"] }

  const url = siteWeb.startsWith("http") ? siteWeb : `https://${siteWeb}`
  const flags: DiagnosticFlag[] = []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
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
      return { flags, loadTimeMs, statusCode: res.status }
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

    return { flags, loadTimeMs, statusCode: res.status }
  } catch {
    clearTimeout(timeout)
    flags.push("SITE_INACCESSIBLE")
    return { flags }
  }
}
