import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { regenerateAudit } from "@/lib/audit-generator"

export const maxDuration = 300

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  if (key && key === process.env.KODORA_INTERNAL_API_KEY) return true
  const auth = req.headers.get("authorization")
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}

// POST /api/audits/regenerate
// Body: { slugs?: string[], take?: number, viewedOnly?: boolean }
//
// Régénère des audits existants EN PLACE (mêmes slugs → les liens déjà envoyés
// affichent le nouveau rapport personnalisé). Sans body, régénère les plus
// récents. viewedOnly limite aux audits déjà consultés par un prospect —
// les prioritaires puisque ce sont eux qui se plaignent du rapport générique.
// Séquentiel (l'audit LokalSEO inclut une passe IA) ; relancer la route
// plusieurs fois pour traiter tout le stock.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const slugs: string[] | undefined = body.slugs
  const take: number = Math.min(body.take ?? 5, 20)
  const viewedOnly: boolean = body.viewedOnly ?? false

  const audits = await prisma.audit.findMany({
    where: slugs?.length
      ? { publicSlug: { in: slugs } }
      : viewedOnly
        ? { firstViewedAt: { not: null } }
        : {},
    orderBy: { generatedAt: "desc" },
    take: slugs?.length ? slugs.length : take,
    select: { id: true, publicSlug: true },
  })

  const started = Date.now()
  const results: { slug: string; ok: boolean; score?: number; error?: string }[] = []

  for (const a of audits) {
    // Garde 50s de marge : un audit LokalSEO peut prendre jusqu'à ~45s.
    if (Date.now() - started > 240_000) break
    try {
      const updated = await regenerateAudit(a.id)
      results.push({ slug: a.publicSlug, ok: true, score: updated.score })
    } catch (err) {
      results.push({ slug: a.publicSlug, ok: false, error: String(err) })
    }
  }

  return NextResponse.json({
    regenerated: results.filter((r) => r.ok).length,
    results,
  })
}
