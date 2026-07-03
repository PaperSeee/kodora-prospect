import { resolveMx } from "node:dns/promises"

// Vérification gratuite de la boîte mail AVANT envoi : un simple lookup DNS.
// Un domaine sans enregistrement MX ne peut pas recevoir d'email → envoyer
// quand même produit un hard bounce, et chaque bounce dégrade la réputation
// de l'expéditeur (le nerf de la guerre en cold email).

const cache = new Map<string, boolean>()

export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase().trim()
  if (!domain || !domain.includes(".")) return false

  const cached = cache.get(domain)
  if (cached !== undefined) return cached

  let ok = false
  try {
    const mx = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ])
    ok = Array.isArray(mx) && mx.length > 0
  } catch {
    // NXDOMAIN, pas de MX, ou timeout → considéré injoignable
    ok = false
  }

  cache.set(domain, ok)
  return ok
}
