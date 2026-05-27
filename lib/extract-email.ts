/**
 * Extrait l'email de contact depuis le site web d'un prospect.
 * Cherche dans la page d'accueil et la page contact si elle existe.
 */
export async function extractEmailFromSite(siteWeb?: string | null): Promise<string | null> {
  if (!siteWeb) return null

  const url = siteWeb.startsWith("http") ? siteWeb : `https://${siteWeb}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KodoraBot/1.0)" },
      redirect: "follow",
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const html = await res.text()
    const email = findEmailInHtml(html)
    if (email) return email

    // Chercher la page contact si pas trouvé en home
    const contactUrl = findContactUrl(html, url)
    if (contactUrl) {
      const ctrl2 = new AbortController()
      const t2 = setTimeout(() => ctrl2.abort(), 6000)
      try {
        const res2 = await fetch(contactUrl, {
          signal: ctrl2.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; KodoraBot/1.0)" },
          redirect: "follow",
        })
        clearTimeout(t2)
        if (res2.ok) {
          const html2 = await res2.text()
          return findEmailInHtml(html2)
        }
      } catch {
        clearTimeout(t2)
      }
    }

    return null
  } catch {
    clearTimeout(timeout)
    return null
  }
}

function findEmailInHtml(html: string): string | null {
  // Décoder les entités HTML communes
  const decoded = html
    .replace(/&#64;/g, "@")
    .replace(/&#x40;/g, "@")
    .replace(/\[at\]/gi, "@")
    .replace(/\(at\)/gi, "@")
    .replace(/&#46;/g, ".")
    .replace(/\[dot\]/gi, ".")

  // Regex email standard
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const matches = decoded.match(emailRegex) ?? []

  // Filtrer les emails non pertinents
  const blacklist = [
    "example.com", "test.com", "domain.com", "email.com",
    "sentry.io", "google.com", "facebook.com", "instagram.com",
    "wordpress.com", "jquery.com", "w3.org", "schema.org",
    "wixpress.com", "squarespace.com", "shopify.com",
  ]

  const valid = matches.filter((e) => {
    const lower = e.toLowerCase()
    if (blacklist.some((b) => lower.includes(b))) return false
    if (lower.includes("noreply") || lower.includes("no-reply")) return false
    if (lower.includes("@2x") || lower.includes("@3x")) return false  // assets
    if (lower.length > 60) return false
    return true
  })

  // Préférer les emails avec "contact", "info", "bonjour", "hello"
  const preferred = valid.find((e) =>
    /contact|info|bonjour|hello|accueil|cabinet|bureau/i.test(e)
  )

  return preferred ?? valid[0] ?? null
}

function findContactUrl(html: string, baseUrl: string): string | null {
  // Chercher un lien "contact" dans le HTML
  const linkRegex = /href=["']([^"']*(?:contact|nous-contacter|contactez|reach|kontakt)[^"']*)["']/gi
  const match = linkRegex.exec(html)
  if (!match) return null

  const href = match[1]
  if (href.startsWith("http")) return href
  if (href.startsWith("/")) {
    try {
      const base = new URL(baseUrl)
      return `${base.origin}${href}`
    } catch {
      return null
    }
  }
  return null
}
