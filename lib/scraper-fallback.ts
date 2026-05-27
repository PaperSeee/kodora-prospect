/**
 * SCRAPER FALLBACK — FRAGILE
 * Activé uniquement si GOOGLE_PLACES_API_KEY est absente ou échoue.
 * Utilise Playwright pour scraper Google Maps headless.
 * ATTENTION : la structure DOM de Google Maps peut changer sans préavis.
 * C'est le seul fichier à corriger en cas de panne du sourcing sans clé Places.
 *
 * Politique de politesse : délais entre requêtes, headless, user-agent normal.
 */

export interface ScrapedBusiness {
  nom: string
  secteur: string
  ville: string
  telephone?: string
  siteWeb?: string
  email?: string
  note?: number
  avis?: number
}

// Cookie de consentement Google pré-accepté pour éviter la page RGPD
const CONSENT_COOKIE = {
  name: "SOCS",
  value: "CAISHAgBEhJnd3NfMjAyNTAxMTUtMF9SQzEaAmZyIAEaBgiA_LO4Bg",
  domain: ".google.com",
  path: "/",
  httpOnly: false,
  secure: true,
  sameSite: "None" as const,
}

export async function scrapeGoogleMaps(
  secteur: string,
  ville: string,
  maxResults: number
): Promise<ScrapedBusiness[]> {
  let browser: import("playwright").Browser | null = null
  try {
    const { chromium } = await import("playwright")
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "fr-FR",
      storageState: {
        cookies: [
          { ...CONSENT_COOKIE, expires: Math.floor(Date.now() / 1000) + 86400 * 365 },
        ],
        origins: [],
      },
    })
    const page = await context.newPage()

    const query = encodeURIComponent(`${secteur} ${ville}`)
    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    // Si toujours sur la page de consentement, cliquer sur Accepter
    if (page.url().includes("consent.google.com")) {
      try {
        await page.click('button[jsname="b3VHJd"], form[action*="save"] button', { timeout: 5000 })
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {})
      } catch {
        // Pas bloquant
      }
    }

    await page.waitForTimeout(2500)

    // Scroll pour charger plus de résultats
    for (let i = 0; i < Math.ceil(maxResults / 5); i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]')
        if (feed) feed.scrollTop += 1000
      })
      await page.waitForTimeout(700 + Math.random() * 300)
    }

    // Extraction : les cartes sont des div directs du feed qui contiennent un lien /maps/place/
    const results = await page.evaluate(
      ({ maxR }: { maxR: number }) => {
        const feed = document.querySelector('[role="feed"]')
        if (!feed) return []

        const cardDivs = Array.from(feed.querySelectorAll(":scope > div")).filter((div) =>
          div.querySelector('a[href*="/maps/place/"]')
        )

        return cardDivs.slice(0, maxR * 2).map((item) => {
          const lines = (item as HTMLElement).innerText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)

          const nom = lines[0] ?? ""

          // Note : format "4,9" ou "4.9"
          const noteStr = lines.find((l) => /^\d[,.]\d$/.test(l))
          const note = noteStr ? parseFloat(noteStr.replace(",", ".")) : undefined

          // Avis : format "(123)"
          let avis: number | undefined
          const avisMatch = lines.join(" ").match(/\((\d+)\)/)
          if (avisMatch) avis = parseInt(avisMatch[1], 10)

          // Téléphone
          const tel = lines.find((l) => /^(\+32|0\d)[\d\s]{6,}$/.test(l))

          // Email visible dans la fiche
          const emailMatch = lines.join(" ").match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
          const email = emailMatch ? emailMatch[0] : undefined

          // Site web
          const siteWebLink = item.querySelector('a[data-item-id*="authority"], a[href*="http"][aria-label*="ite"]')
          const siteWeb = siteWebLink ? (siteWebLink as HTMLAnchorElement).href : undefined

          return { nom, note, avis, telephone: tel, siteWeb, email }
        })
      },
      { maxR: maxResults }
    )

    return results
      .filter((r) => r.nom && r.nom.length > 1)
      .slice(0, maxResults)
      .map((r) => ({ ...r, secteur, ville }))
  } catch (err) {
    console.error("[scraper-fallback] Erreur Playwright:", err)
    return []
  } finally {
    await browser?.close()
  }
}
