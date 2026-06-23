import { prisma } from "@/lib/prisma"
import { auditEmailTemplate, noSiteEmailTemplate, staticEmailTemplate } from "@/lib/email-templates"
import { generateAudit } from "@/lib/audit-generator"
import type { DiagnosticFlag } from "@/lib/diagnose"

// Génération des emails, partagée entre la route /api/email/batch et le
// pipeline auto. Appelée en direct (pas de fetch HTTP interne).

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
    : { OR: [{ emailCorps: null }, { emailCorps: "" }], statut: "a_contacter" }

  const prospects = await prisma.prospect.findMany({
    where,
    take,
    orderBy: { score: "desc" },
    include: { audits: { orderBy: { generatedAt: "desc" }, take: 1 } },
  })

  const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "https://lokalseo.be/rapport/"
  let count = 0

  for (const prospect of prospects) {
    try {
      let objet: string
      let corps: string

      if (!hasSiteReel(prospect.siteWeb)) {
        const result = noSiteEmailTemplate(prospect.nom, prospect.secteur, prospect.ville, prospect.avis)
        objet = result.objet
        corps = result.corps
      } else {
        let audit = prospect.audits[0] ?? null
        if (!audit) {
          try { audit = await generateAudit(prospect.id) } catch { /* ignore */ }
        }

        if (audit) {
          const auditUrl = `${baseUrl}${audit.publicSlug}`
          const problemes = JSON.parse(audit.problemesJson ?? "[]") as { titre: string }[]
          const result = auditEmailTemplate(prospect.nom, audit.score, problemes.length || 3, auditUrl, problemes[0]?.titre ?? null)
          objet = result.objet
          corps = result.corps
        } else {
          const diagData = prospect.diagnostic ? JSON.parse(prospect.diagnostic) : { flags: [] }
          const flags: DiagnosticFlag[] = diagData.flags ?? []
          const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis, prospect.ville)
          if (!tmpl) continue
          objet = tmpl.objet
          corps = tmpl.corps
        }
      }

      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { emailObjet: objet, emailCorps: corps },
      })
      count++
    } catch { /* ignore individual errors */ }
  }

  return count
}
