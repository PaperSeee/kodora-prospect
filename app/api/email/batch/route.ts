import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auditEmailTemplate, staticEmailTemplate } from "@/lib/email-templates"
import { generateAudit } from "@/lib/audit-generator"
import type { DiagnosticFlag } from "@/lib/diagnose"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { regenerate } = body

  // Si regenerate=true : régénère TOUS les prospects à_contacter avec un email (ancien format)
  // Sinon : seulement ceux sans email
  const where = regenerate
    ? { statut: "a_contacter", email: { not: null } }
    : { OR: [{ emailCorps: null }, { emailCorps: "" }], statut: "a_contacter" }

  const prospects = await prisma.prospect.findMany({
    where,
    take: 10,
    orderBy: { score: "desc" },
    include: { audits: { orderBy: { generatedAt: "desc" }, take: 1 } },
  })

  const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "https://lokalseo.be/rapport/"
  let count = 0

  for (const prospect of prospects) {
    try {
      // Obtenir ou générer l'audit
      let audit = prospect.audits[0] ?? null
      if (!audit) {
        try { audit = await generateAudit(prospect.id) } catch { /* ignore */ }
      }

      let objet: string
      let corps: string

      if (audit) {
        // Nouveau template avec score + lien audit
        const auditUrl = `${baseUrl}${audit.publicSlug}`
        const problemes = JSON.parse(audit.problemesJson ?? "[]") as { titre: string }[]
        const result = auditEmailTemplate(prospect.nom, audit.score, problemes.length || 3, auditUrl)
        objet = result.objet
        corps = result.corps
      } else {
        // Fallback template générique
        const diagData = prospect.diagnostic ? JSON.parse(prospect.diagnostic) : { flags: [] }
        const flags: DiagnosticFlag[] = diagData.flags ?? []
        const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis)
        if (!tmpl) continue
        objet = tmpl.objet
        corps = tmpl.corps
      }

      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { emailObjet: objet, emailCorps: corps },
      })
      count++
    } catch { /* ignore individual errors */ }
  }

  return NextResponse.json({ count })
}
