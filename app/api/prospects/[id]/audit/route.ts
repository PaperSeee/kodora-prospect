import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/prospects/[id]/audit — dernier audit d'un prospect pour le CRM
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const prospectId = parseInt(id)
  if (isNaN(prospectId)) return NextResponse.json(null, { status: 400 })

  const audit = await prisma.audit.findFirst({
    where: { prospectId },
    orderBy: { generatedAt: "desc" },
    select: {
      publicSlug: true,
      score: true,
      viewCount: true,
      ctaClicked: true,
      firstViewedAt: true,
      generatedAt: true,
    },
  })

  if (!audit) return NextResponse.json(null, { status: 404 })
  return NextResponse.json(audit)
}
