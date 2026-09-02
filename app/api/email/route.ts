import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adsEmail1Observation, noSiteEmailTemplate } from "@/lib/email-templates"

const PLATEFORMES = ["doctoranytime", "zocdoc", "practo", "facebook.com", "instagram.com", "linkedin.com"]

function hasSiteReel(siteWeb?: string | null): boolean {
  if (!siteWeb) return false
  return !PLATEFORMES.some(p => siteWeb.toLowerCase().includes(p))
}

export async function POST(req: NextRequest) {
  const { prospectId } = await req.json()

  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } })
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 })

  // ── Cas 1 : pas de site réel → offre site vitrine (préalable à l'offre Ads) ──
  if (!hasSiteReel(prospect.siteWeb)) {
    const { objet, corps } = noSiteEmailTemplate(prospect.nom, prospect.secteur, prospect.ville, prospect.avis)
    await prisma.prospect.update({ where: { id: prospectId }, data: { emailObjet: objet, emailCorps: corps } })
    return NextResponse.json({ objet, corps })
  }

  // ── Cas 2 : a un site → email 1 de la séquence Ads ─────────────
  const diagData = prospect.diagnostic ? (JSON.parse(prospect.diagnostic) as { concurrentsPayants?: string[] }) : {}
  const concurrentsPayants = diagData.concurrentsPayants ?? []

  const { objet, corps } = adsEmail1Observation(prospect.nom, prospect.secteur, {
    motCle: prospect.secteur,
    commune: prospect.ville,
    concurrent1: concurrentsPayants[0] ?? null,
    concurrent2: concurrentsPayants[1] ?? null,
  })

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { emailObjet: objet, emailCorps: corps },
  })

  return NextResponse.json({ objet, corps })
}
