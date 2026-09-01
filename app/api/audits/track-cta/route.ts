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

    // Un clic n'est pas un rendez-vous — et une partie de ces clics vient de
    // scanners de sécurité (Outlook Safe Links, Barracuda, Proofpoint) qui
    // suivent tous les liens d'un email automatiquement. "rdv" reste
    // exclusivement manuel, avec une date obligatoire (voir PATCH /api/prospects/[id]).
    await prisma.prospect.update({
      where: { id: audit.prospectId },
      data: { statut: "cta_clique" },
    })

    // Notif immédiate — signal fort mais pas un événement confirmé humain,
    // le libellé du webhook le dit explicitement.
    const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
    if (webhookUrl) {
      const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🔥 **CTA cliqué** — ${audit.prospect.nom} vient de cliquer sur "Demander un devis" (peut être un scanner de sécurité, à vérifier).\nScore : ${audit.score}/100\nEmail : ${audit.prospect.email ?? "inconnu"}\nTél : ${audit.prospect.telephone ?? "inconnu"}\nAudit : ${baseUrl}${audit.publicSlug}\nStatut → cta_clique`,
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
