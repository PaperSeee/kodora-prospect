import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Chaque métrique doit porter un nom qui décrit exactement d'où elle vient
// — pas un mot qui évoque l'intérêt commercial ("chaud") sur une donnée qui
// n'est qu'un score interne calculé au sourcing. Le champ `definitions`
// ci-dessous documente la provenance exacte de chaque chiffre, pour qu'on
// ne puisse plus lire un nombre en lui prêtant un sens qu'il n'a pas.
const DEFINITIONS: Record<string, string> = {
  total: "Nombre total de prospects en base, tous statuts confondus.",
  parStatut:
    "Répartition par statut. Un statut ne change que sur un événement vérifié et horodaté (webhook Brevo delivered/bounce, tracking anti-bot, ou action manuelle datée pour rdv) — sauf les valeurs *_non_verifie, historiques d'avant le correctif KPI du 2026-09-01.",
  parSecteur: "Répartition par secteur d'activité, top 8.",
  avgScore: "Score de sourcing moyen (0-100), calculé par lib/score.ts — ne mesure aucun intérêt exprimé.",
  maxScore: "Score de sourcing maximum observé.",
  scoreSuperieur50: "Nombre de prospects dont le SCORE DE SOURCING (pas l'intérêt commercial) est ≥ 50. Anciennement nommé 'chauds', renommé car ce nom laissait croire à un signal d'intérêt.",
  avecEmail: "Nombre de prospects pour lesquels une adresse email a été trouvée.",
  avecEmailCorps: "Nombre de prospects pour lesquels un email a été rédigé (IA), prêt à être envoyé.",
  recents: "Les 5 derniers prospects créés, par date de création.",
}

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
    parSecteur: parSecteur.map((s: { secteur: string; _count: number }) => ({ secteur: s.secteur, count: s._count })),
    avgScore: Math.round(scores._avg.score ?? 0),
    maxScore: scores._max.score ?? 0,
    scoreSuperieur50: await prisma.prospect.count({ where: { score: { gte: 50 } } }),
    avecEmail: await prisma.prospect.count({ where: { email: { not: null } } }),
    avecEmailCorps: await prisma.prospect.count({ where: { emailCorps: { not: null } } }),
    recents,
    definitions: DEFINITIONS,
  })
}
