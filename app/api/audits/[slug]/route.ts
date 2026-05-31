import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

// GET /api/audits/[slug] — récupère un audit par slug public (appelé par LokalSEO)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug } = await params
  const audit = await prisma.audit.findUnique({
    where: { publicSlug: slug },
    include: { prospect: { select: { nom: true, secteur: true, ville: true, siteWeb: true } } },
  })

  if (!audit) return NextResponse.json({ error: "not found" }, { status: 404 })

  return NextResponse.json({
    id: audit.id,
    publicSlug: audit.publicSlug,
    score: audit.score,
    problemes: JSON.parse(audit.problemesJson),
    rapport: audit.rapportJson ? JSON.parse(audit.rapportJson) : null,
    generatedAt: audit.generatedAt,
    prospect: audit.prospect,
  })
}
