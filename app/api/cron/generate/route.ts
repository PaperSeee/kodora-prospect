import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateEmailBatch } from "@/lib/generate-emails"
import { regenerateAudit } from "@/lib/audit-generator"
import { sourceSecteur } from "@/lib/source-prospects"
import { dailyCap, SECTEURS_ROTATION, COMMUNES, MAX_PAR_SECTEUR, DIAG_TIMEOUT_PIPELINE_MS } from "@/lib/pipeline-config"

// ── CRON QUOTIDIEN : RÉAPPROVISIONNEMENT ──
// Tourne chaque matin AVANT le cron d'envoi (/api/pipeline/run) pour que le
// stock d'emails rédigés couvre toujours le plafond du jour. Sans lui, le
// stock finit par se vider et le rapport affiche « 0 envoyés ».
//
// Stratégie, dans l'ordre, tant que le budget temps le permet :
//   1. Rédiger les emails des prospects qui ont déjà une adresse ;
//   2. S'il n'y a plus rien à rédiger et que le stock est encore court,
//      sourcer de nouveaux prospects (OSM gratuit) puis rédiger.
export const maxDuration = 300

const TIME_BUDGET_MS = 280_000 // marge sous les 300s Vercel

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true

  const internalKey = process.env.KODORA_INTERNAL_API_KEY
  const xKey = req.headers.get("x-api-key")
  if (internalKey && xKey === internalKey) return true

  // Si aucun secret n'est configuré (dev local), on laisse passer.
  if (!cronSecret && !internalKey) return true

  return false
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  }

  const started = Date.now()
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - started)

  const stockPretCount = () =>
    prisma.prospect.count({
      where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
    })

  // Objectif : 1,5× le plafond d'envoi du jour, pour absorber les envois
  // qui échouent (adresse morte, MX purgé) sans jamais retomber à zéro.
  const firstRun = await prisma.pipelineRun.findFirst({ orderBy: { startedAt: "asc" } })
  const days = firstRun
    ? Math.floor((Date.now() - firstRun.startedAt.getTime()) / 86_400_000)
    : 0
  const objectif = Math.ceil(dailyCap(days) * 1.5)

  // Rotation de sourcing du jour (même logique que l'ancien pipeline) :
  // un sous-ensemble de secteurs différent chaque jour, communes en ordre
  // de priorité.
  const secteurs = SECTEURS_ROTATION[new Date().getDate() % SECTEURS_ROTATION.length]
  const paires: [string, string][] = []
  for (const commune of COMMUNES) for (const secteur of secteurs) paires.push([secteur, commune])
  let paireIdx = 0

  let generated = 0
  let sourced = 0
  let stockPret = await stockPretCount()

  while (stockPret < objectif && timeLeft() > 15_000) {
    const n = await generateEmailBatch({ take: 5 })
    if (n > 0) {
      generated += n
      stockPret = await stockPretCount()
      continue
    }

    // Plus aucun prospect avec email à rédiger → sourcer du neuf.
    let nouveaux = 0
    while (paireIdx < paires.length && timeLeft() > 30_000) {
      const [secteur, commune] = paires[paireIdx++]
      nouveaux = await sourceSecteur(secteur, commune, MAX_PAR_SECTEUR, undefined, DIAG_TIMEOUT_PIPELINE_MS)
      if (nouveaux > 0) break
    }
    if (nouveaux === 0) break // plus rien à sourcer aujourd'hui non plus
    sourced += nouveaux
  }

  // ── RÉGÉNÉRATION DES ANCIENS AUDITS ──
  // Le reliquat du budget temps sert à réécrire les audits générés avant la
  // personnalisation (rapportJson sans pointsForts) — EN PLACE, mêmes slugs,
  // pour que les liens déjà envoyés affichent le nouveau rapport. Priorité
  // aux audits déjà consultés par un prospect, puis aux plus récents.
  // ~40s par audit → quelques-uns par jour, le stock actif y passe en
  // une à deux semaines sans intervention.
  let regenerated = 0
  if (timeLeft() > 60_000) {
    const candidats = await prisma.audit.findMany({
      where: { OR: [{ rapportJson: null }, { rapportJson: { not: { contains: "pointsForts" } } }] },
      orderBy: [{ firstViewedAt: { sort: "desc", nulls: "last" } }, { generatedAt: "desc" }],
      take: 10,
      select: { id: true },
    })
    for (const a of candidats) {
      if (timeLeft() < 60_000) break
      try {
        await regenerateAudit(a.id)
        regenerated++
      } catch { /* LokalSEO indisponible — retentera demain */ }
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    sourced,
    regenerated,
    stockPret,
    objectif,
    note:
      stockPret < objectif
        ? "Stock encore sous l'objectif — le prochain run continuera, ou utilise le bouton « gros stock »."
        : undefined,
  })
}

// Le cron Vercel envoie un GET par défaut.
export async function GET(req: NextRequest) {
  return POST(req)
}
