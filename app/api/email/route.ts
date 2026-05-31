import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auditEmailTemplate, staticEmailTemplate } from "@/lib/email-templates"
import { generateAudit } from "@/lib/audit-generator"
import type { DiagnosticFlag } from "@/lib/diagnose"

export async function POST(req: NextRequest) {
  const { prospectId } = await req.json()

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    include: { audits: { orderBy: { generatedAt: "desc" }, take: 1 } },
  })
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 })

  // ── Étape 1 : obtenir ou générer l'audit ─────────────────────
  let audit = prospect.audits[0] ?? null
  if (!audit) {
    try {
      audit = await generateAudit(prospectId)
    } catch (err) {
      console.error("[email] audit generation failed, continuing without:", err)
    }
  }

  const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "https://lokalseo.be/rapport/"

  // ── Étape 2 : si audit dispo → template audit ────────────────
  if (audit) {
    const auditUrl = `${baseUrl}${audit.publicSlug}`
    const problemes = JSON.parse(audit.problemesJson ?? "[]") as { titre: string }[]
    const nbProblemes = problemes.length || 3
    const { objet, corps } = auditEmailTemplate(prospect.nom, audit.score, nbProblemes, auditUrl)

    await prisma.prospect.update({
      where: { id: prospectId },
      data: { emailObjet: objet, emailCorps: corps },
    })

    return NextResponse.json({ objet, corps, auditUrl, score: audit.score })
  }

  // ── Étape 3 : fallback template générique ────────────────────
  const diagData = prospect.diagnostic ? JSON.parse(prospect.diagnostic) : { flags: [] }
  const flags: DiagnosticFlag[] = diagData.flags ?? []

  const apiKey = process.env.ANTHROPIC_API_KEY
  let objet: string
  let corps: string

  if (apiKey) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default
      const client = new Anthropic({ apiKey })
      const problemes = flags.join(", ") || "présence web insuffisante"
      const avisInfo = prospect.avis ? `${prospect.avis} avis Google` : "pas d'avis connus"

      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Tu es un expert en prospection web B2B. Rédige un email de prospection froid en français pour un ${prospect.secteur} nommé "${prospect.nom}" à ${prospect.ville}.

Problèmes détectés sur leur site : ${problemes}
Informations additionnelles : ${avisInfo}

Règles STRICTES :
- Ton personnel, direct, comme un vrai email humain
- Court : objet + 4 à 5 lignes maximum
- L'objet doit être neutre et naturel — JAMAIS "offre", "promotion", "gratuit", "prix"
- Corps : commencer par "Bonjour," sans le nom
- Terminer par : "Ilias\\nKodora — kodora.eu\\n+32 451 05 33 70\\n\\nP.S. — Si ce mail ne vous intéresse pas, ignorez-le simplement."
- Si aucun problème réel détecté, réponds UNIQUEMENT {"objet": "", "corps": ""}

Réponds UNIQUEMENT en JSON : {"objet": "...", "corps": "..."}`,
        }],
      })

      const text = message.content[0].type === "text" ? message.content[0].text : ""
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")
      objet = parsed.objet ?? ""
      corps = parsed.corps ?? ""
      if (!objet || !corps) return NextResponse.json({ error: "Aucun problème détecté" }, { status: 422 })
    } catch (err) {
      console.error("[email] Anthropic error, falling back to template:", err)
      const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis)
      if (!tmpl) return NextResponse.json({ error: "Aucun problème détecté" }, { status: 422 })
      objet = tmpl.objet
      corps = tmpl.corps
    }
  } else {
    const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis)
    if (!tmpl) return NextResponse.json({ error: "Aucun problème détecté" }, { status: 422 })
    objet = tmpl.objet
    corps = tmpl.corps
  }

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { emailObjet: objet, emailCorps: corps },
  })

  return NextResponse.json({ objet, corps })
}
