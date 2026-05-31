import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

// POST /api/audits/track-cta
// Appelé par LokalSEO quand le CTA "Demander un devis" est cliqué
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

  if (!audit.ctaClicked) {
    await prisma.audit.update({
      where: { id: audit.id },
      data: { ctaClicked: true, ctaClickedAt: new Date() },
    })

    await prisma.prospect.update({
      where: { id: audit.prospectId },
      data: { statut: "rdv" },
    })

    // Notif immédiate 🔥
    const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
    if (webhookUrl) {
      const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🔥 **LEAD ULTRA CHAUD** — ${audit.prospect.nom} vient de cliquer sur "Demander un devis" !\nScore : ${audit.score}/100\nEmail : ${audit.prospect.email ?? "inconnu"}\nTél : ${audit.prospect.telephone ?? "inconnu"}\nAudit : ${baseUrl}${audit.publicSlug}\nStatut → rdv`,
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
