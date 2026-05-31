import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

// POST /api/audits/track-view
// Appelé par LokalSEO quand un audit est consulté
// Body: { slug: string }
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug } = await req.json()
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 })

  const audit = await prisma.audit.findUnique({
    where: { publicSlug: slug },
    include: { prospect: true },
  })
  if (!audit) return NextResponse.json({ error: "not found" }, { status: 404 })

  const now = new Date()
  const isFirstView = audit.viewCount === 0

  await prisma.audit.update({
    where: { id: audit.id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: now,
      firstViewedAt: isFirstView ? now : undefined,
    },
  })

  // Relance à chaud si première vue + prospect déjà contacté
  if (isFirstView && audit.prospect.statut === "contacte") {
    // Marquer lead chaud
    await prisma.prospect.update({
      where: { id: audit.prospectId },
      data: { statut: "lead_chaud" },
    })

    // Notif Discord/webhook
    const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
    if (webhookUrl) {
      const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `👁️ **${audit.prospect.nom}** vient de consulter son audit pour la première fois !\nScore : ${audit.score}/100\nAudit : ${baseUrl}${audit.publicSlug}\nStatut → lead_chaud`,
        }),
      }).catch(() => {})
    }

    // Programmer relance à chaud via Brevo (60 min)
    scheduleWarmFollowUp(audit.prospect, audit.publicSlug).catch(() => {})
  }

  return NextResponse.json({ ok: true, isFirstView, viewCount: audit.viewCount + 1 })
}

async function scheduleWarmFollowUp(
  prospect: { id: number; nom: string; email: string | null; secteur: string },
  slug: string
) {
  if (!prospect.email) return

  const brevoKey = process.env.BREVO_API_KEY
  if (!brevoKey) return

  const prenom = prospect.nom.split(" ")[0]
  const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"

  // Envoi différé 60 min via Brevo transactionnel
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify({
      sender: { name: "Ilias — Kodora", email: "ilias@kodora.eu" },
      to: [{ email: prospect.email }],
      subject: "Une question sur votre audit ?",
      textContent: `Bonjour ${prenom},

J'ai vu que vous avez consulté votre audit. Y a-t-il un point que vous souhaitez clarifier ou une question sur les résultats ?

Le rapport est toujours accessible ici : ${baseUrl}${slug}

Bonne journée,
Ilias — Kodora

P.S. Si vous n'êtes pas intéressé, ignorez simplement ce message.`,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tags: ["relance-chaude"],
    }),
  })
}
