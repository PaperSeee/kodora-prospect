import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { staticEmailTemplate } from "@/lib/email-templates"
import type { DiagnosticFlag } from "@/lib/diagnose"

export async function POST(req: NextRequest) {
  const { statut } = await req.json()

  // Match both null and empty string (some records stored as "")
  const baseWhere = { OR: [{ emailCorps: null }, { emailCorps: "" }], statut: "a_contacter" }
  const where = statut ? { ...baseWhere, statut } : baseWhere
  const prospects = await prisma.prospect.findMany({ where, take: 10, orderBy: { score: "desc" } })

  const apiKey = process.env.ANTHROPIC_API_KEY
  let Anthropic: typeof import("@anthropic-ai/sdk").default | null = null
  if (apiKey) {
    Anthropic = (await import("@anthropic-ai/sdk")).default
  }

  let count = 0
  for (const prospect of prospects) {
    const diagData = prospect.diagnostic ? JSON.parse(prospect.diagnostic) : { flags: [] }
    const flags: DiagnosticFlag[] = diagData.flags ?? []

    let objet: string
    let corps: string

    if (Anthropic && apiKey) {
      try {
        const client = new Anthropic({ apiKey })
        const problemes = flags.join(", ") || "présence web insuffisante"
        const avisInfo = prospect.avis ? `${prospect.avis} avis Google` : "pas d'avis connus"

        const message = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: `Tu es un expert en prospection web B2B. Rédige un email de prospection froid en français pour un ${prospect.secteur} nommé "${prospect.nom}" à ${prospect.ville}.

Problèmes détectés sur leur site : ${problemes}
Informations additionnelles : ${avisInfo}

Règles STRICTES (délivrabilité email) :
- Ton personnel, direct, comme un vrai email humain — pas un mail commercial
- Court : objet + 4 à 5 lignes maximum, pas plus
- L'objet doit être neutre et naturel (ex: "Une question rapide", "J'ai regardé votre site") — JAMAIS "offre", "promotion", "gratuit", "prix", "devis"
- Corps : commencer par "Bonjour," sans le nom — mentionner le problème précis observé
- NE PAS utiliser les mots : offre, promotion, gratuit, profitez, exclusif, urgent, limité, euros, prix, tarif, remise
- NE PAS mettre de majuscules abusives, pas de points d'exclamation
- Terminer par la signature : "Ilias\\nKodora — kodora.eu\\n+32 451 05 33 70\\n\\nPour ne plus recevoir mes messages, répondez STOP."
- Si aucun problème réel n'est détecté, réponds UNIQUEMENT {"objet": "", "corps": ""}

Réponds UNIQUEMENT en JSON avec ce format exact :
{"objet": "...", "corps": "..."}`,
            },
          ],
        })

        const text = message.content[0].type === "text" ? message.content[0].text : ""
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")
        objet = parsed.objet ?? ""
        corps = parsed.corps ?? ""
        if (!objet || !corps) continue
      } catch {
        const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis)
        if (!tmpl) continue
        objet = tmpl.objet
        corps = tmpl.corps
      }
    } else {
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

    if (Anthropic) await new Promise((r) => setTimeout(r, 100))
  }

  return NextResponse.json({ count })
}
