import { prisma } from "@/lib/prisma"
import { adsEmail1Observation, noSiteEmailTemplate, staticEmailTemplate } from "@/lib/email-templates"
import { diagnoseSite } from "@/lib/diagnose"
import type { DiagnosticFlag } from "@/lib/diagnose"
import { secteurMeta } from "@/lib/pipeline-config"

// Génération des emails, partagée entre la route /api/email/batch et le
// pipeline auto. Appelée en direct (pas de fetch HTTP interne).
//
// Offre principale : Google Ads, pour qui a une page où envoyer le trafic
// payant. Un prospect sans site réel n'est pas un bon prospect Ads — il
// reçoit à la place l'offre secondaire (site vitrine, noSiteEmailTemplate),
// plutôt que d'être écarté sans email (réactivé le 2026-09-02 : autant
// contacter ce volume avec l'offre adaptée que le jeter).

const PLATEFORMES = ["doctoranytime", "zocdoc", "practo", "facebook.com", "instagram.com", "linkedin.com"]

function hasSiteReel(siteWeb?: string | null): boolean {
  if (!siteWeb) return false
  return !PLATEFORMES.some((p) => siteWeb.toLowerCase().includes(p))
}

// Génère les emails pour un lot de prospects (par défaut ceux qui n'en ont pas).
// Retourne le nombre d'emails générés.
export async function generateEmailBatch(opts: { regenerate?: boolean; take?: number } = {}): Promise<number> {
  const { regenerate = false, take = 10 } = opts

  const where = regenerate
    ? { statut: "a_contacter", email: { not: null } }
    : { OR: [{ emailCorps: null }, { emailCorps: "" }], statut: "a_contacter", email: { not: null } }

  const prospects = await prisma.prospect.findMany({
    where,
    take,
    orderBy: { score: "desc" },
  })

  let count = 0

  for (const prospect of prospects) {
    try {
      if (!hasSiteReel(prospect.siteWeb)) {
        // Aucune page où envoyer du trafic payant : offre vitrine à la
        // place de l'offre Ads, pas d'écart silencieux (voir noSiteEmailTemplate).
        const { objet, corps } = noSiteEmailTemplate(prospect.nom, prospect.secteur, prospect.ville, prospect.avis)
        await prisma.prospect.update({
          where: { id: prospect.id },
          data: { emailObjet: objet, emailCorps: corps },
        })
        count++
        continue
      }

      const diagData = prospect.diagnostic ? (JSON.parse(prospect.diagnostic) as { flags?: DiagnosticFlag[]; concurrentsPayants?: string[] }) : {}
      const concurrentsPayants = diagData.concurrentsPayants ?? []

      const { objet, corps } = adsEmail1Observation(prospect.nom, prospect.secteur, {
        motCle: secteurMeta(prospect.secteur).motCle,
        commune: prospect.ville,
        concurrent1: concurrentsPayants[0] ?? null,
        concurrent2: concurrentsPayants[1] ?? null,
      })

      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { emailObjet: objet, emailCorps: corps },
      })
      count++
    } catch { /* ignore individual errors */ }
  }

  return count
}

// Conservé pour l'envoi manuel ponctuel d'un site vitrine (voir
// ProspectDetail.tsx) — plus utilisé par le batch automatique.
export async function noSiteFallback(prospectId: number): Promise<{ objet: string; corps: string } | null> {
  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } })
  if (!prospect) return null
  return noSiteEmailTemplate(prospect.nom, prospect.secteur, prospect.ville, prospect.avis)
}

// Repli si le diagnostic n'a produit aucun signal Ads exploitable — garde
// staticEmailTemplate en réserve pour ne pas casser les appels existants.
export function staticFallback(prospect: { nom: string; secteur: string; avis?: number | null; ville?: string | null }, flags: DiagnosticFlag[]) {
  return staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis, prospect.ville)
}

export { diagnoseSite }
