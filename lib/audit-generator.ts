import { prisma } from "./prisma"

// Génère un slug public court (8 chars, URL-safe)
function generateSlug(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

// Clamp score dans la fenêtre UX 35-75
function clampScore(raw: number): number {
  return Math.min(75, Math.max(35, Math.round(raw)))
}

export interface AuditProbleme {
  titre: string
  impact: string
  impactBusiness: string
  categorie: "gbp" | "site" | "avis" | "maps" | "contenu"
}

export async function generateAudit(prospectId: number) {
  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })

  // Appel LokalSEO API pour l'analyse complète
  const lokalseoUrl = process.env.LOKALSEO_API_URL || "http://localhost:3000"
  const apiKey = process.env.LOKALSEO_API_KEY || ""

  let rapportData: Record<string, unknown> | null = null
  let scoreRaw = 50

  try {
    // Timeout 8s : l'audit LokalSEO peut être lent. Sans ça, un seul site lent
    // bloque tout le run et provoque un FUNCTION_INVOCATION_TIMEOUT sur Vercel.
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8_000)
    const res = await fetch(`${lokalseoUrl}/api/audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        entreprise: prospect.nom,
        ville: prospect.ville,
        siteWeb: prospect.siteWeb || undefined,
      }),
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.ok) {
      rapportData = await res.json()
      scoreRaw = (rapportData?.scoreGlobal as number) ?? 50
    }
  } catch {
    // LokalSEO down ou trop lent — fallback sur le score diagnostic existant
    scoreRaw = prospect.score > 0 ? 40 + Math.round(prospect.score * 0.3) : 45
  }

  const score = clampScore(scoreRaw)

  // Extraire les 3 problèmes prioritaires depuis le rapport
  const problemes: AuditProbleme[] = []
  if (rapportData?.actionsPrioritaires) {
    const actions = rapportData.actionsPrioritaires as Array<{
      titre: string; description: string; impact: string; categorie: string
    }>
    for (const a of actions.slice(0, 3)) {
      problemes.push({
        titre: a.titre,
        impact: a.description,
        impactBusiness: estimateBusinessImpact(a.categorie, a.impact),
        categorie: a.categorie as AuditProbleme["categorie"],
      })
    }
  }

  // Fallback si pas de rapport
  if (problemes.length === 0 && prospect.diagnostic) {
    try {
      const diag = JSON.parse(prospect.diagnostic) as { flags: string[] }
      const flags = diag.flags ?? []
      if (flags.includes("PAS_MOBILE")) {
        problemes.push({
          titre: "Site non optimisé pour mobile",
          impact: "70% des recherches locales se font sur smartphone — vos visiteurs partent immédiatement.",
          impactBusiness: "Estimation : ~8 contacts perdus par mois",
          categorie: "site",
        })
      }
      if (flags.some(f => f.startsWith("SITE_DATE_"))) {
        const year = flags.find(f => f.startsWith("SITE_DATE_"))?.replace("SITE_DATE_", "") ?? "ancienne"
        problemes.push({
          titre: `Site vieillissant (${year})`,
          impact: "Google pénalise les sites anciens et les visiteurs perçoivent l'entreprise comme dépassée.",
          impactBusiness: "Perte estimée : 30-40% de crédibilité en ligne",
          categorie: "site",
        })
      }
      if (flags.includes("SITE_LENT")) {
        problemes.push({
          titre: "Site trop lent",
          impact: "53% des visiteurs abandonnent si le site met plus de 3 secondes à charger.",
          impactBusiness: "~50% du trafic mobile perdu",
          categorie: "site",
        })
      }
    } catch { /* ignore */ }
  }

  // Slug unique
  let publicSlug = generateSlug()
  let attempts = 0
  while (attempts < 10) {
    const existing = await prisma.audit.findUnique({ where: { publicSlug } })
    if (!existing) break
    publicSlug = generateSlug()
    attempts++
  }

  const audit = await prisma.audit.create({
    data: {
      prospectId,
      publicSlug,
      score,
      problemesJson: JSON.stringify(problemes),
      rapportJson: rapportData ? JSON.stringify(rapportData) : null,
    },
  })

  return audit
}

function estimateBusinessImpact(categorie: string, impact: string): string {
  if (categorie === "gbp" && impact === "haute") return "Invisible sur Google Maps — 0 appel entrant depuis Maps"
  if (categorie === "avis") return "3× moins de clics que les concurrents avec 20+ avis"
  if (categorie === "site" && impact === "haute") return "Estimation : ~10 contacts perdus par mois"
  if (categorie === "contenu") return "Trafic organique 3× inférieur aux concurrents avec un blog"
  if (categorie === "maps") return "Absent des recherches locales dans ces zones"
  return "Impact direct sur votre acquisition de nouveaux clients"
}
