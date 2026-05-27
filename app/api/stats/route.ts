import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const [total, parStatut, parSecteur, scores, recents] = await Promise.all([
    prisma.prospect.count(),
    prisma.prospect.groupBy({ by: ["statut"], _count: true }),
    prisma.prospect.groupBy({ by: ["secteur"], _count: true, orderBy: { _count: { secteur: "desc" } }, take: 8 }),
    prisma.prospect.aggregate({ _avg: { score: true }, _max: { score: true } }),
    prisma.prospect.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, nom: true, secteur: true, score: true, statut: true, createdAt: true },
    }),
  ])

  const statutMap: Record<string, number> = {}
  for (const s of parStatut) statutMap[s.statut] = s._count

  return NextResponse.json({
    total,
    parStatut: statutMap,
    parSecteur: parSecteur.map((s) => ({ secteur: s.secteur, count: s._count })),
    avgScore: Math.round(scores._avg.score ?? 0),
    maxScore: scores._max.score ?? 0,
    chauds: await prisma.prospect.count({ where: { score: { gte: 50 } } }),
    avecEmail: await prisma.prospect.count({ where: { email: { not: null } } }),
    avecEmailCorps: await prisma.prospect.count({ where: { emailCorps: { not: null } } }),
    recents,
  })
}
