import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { staticEmailTemplate } from "@/lib/email-templates"
import type { DiagnosticFlag } from "@/lib/diagnose"

export async function POST(req: NextRequest) {
  const { statut } = await req.json()

  const where = statut ? { statut, emailCorps: null } : { emailCorps: null }
  const prospects = await prisma.prospect.findMany({ where })

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

Règles :
- Ton professionnel mais humain, adapté au secteur (${prospect.secteur})
- Court : objet + 4 à 6 lignes de corps maximum
- Mentionner naturellement le problème précis du site
- Finir par la signature : "Ilias — Kodora\\n+32 451 05 33 70\\nhttps://www.kodora.eu" puis "Répondez STOP pour ne plus recevoir nos messages"
- NE PAS mentionner de tarif

Réponds UNIQUEMENT en JSON avec ce format exact :
{"objet": "...", "corps": "..."}`,
            },
          ],
        })

        const text = message.content[0].type === "text" ? message.content[0].text : ""
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")
        objet = parsed.objet ?? ""
        corps = parsed.corps ?? ""
      } catch {
        const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis)
        objet = tmpl.objet
        corps = tmpl.corps
      }
    } else {
      const tmpl = staticEmailTemplate(prospect.nom, prospect.secteur, flags, prospect.avis)
      objet = tmpl.objet
      corps = tmpl.corps
    }

    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { emailObjet: objet, emailCorps: corps },
    })
    count++

    // Petite pause pour ne pas saturer l'API
    if (Anthropic) await new Promise((r) => setTimeout(r, 300))
  }

  return NextResponse.json({ count })
}
