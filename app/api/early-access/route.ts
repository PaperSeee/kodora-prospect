import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email, url, slug } = await req.json()
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })

  await prisma.earlyAccessSignup.upsert({
    where: { email },
    create: { email, url: url || null },
    update: { url: url || undefined },
  })

  // Si l'inscription provient d'un audit (slug), c'est un signal d'intérêt
  // fort : on relie au prospect, on le marque lead chaud et on notifie.
  if (slug) {
    const audit = await prisma.audit.findUnique({
      where: { publicSlug: slug },
      include: { prospect: true },
    })
    if (audit) {
      // Laisser un email est un signal vérifié (formulaire rempli), pas un
      // proxy — contrairement aux bugs corrigés (clic, vue). On ne
      // rétrograde jamais un statut déjà plus avancé dans le funnel.
      const FUNNEL_ORDER = [
        "a_contacter", "en_file", "contacte", "audit_vu", "cta_clique",
        "a_repondu", "rdv", "signe",
      ]
      const currentIdx = FUNNEL_ORDER.indexOf(audit.prospect.statut)
      const audituVuIdx = FUNNEL_ORDER.indexOf("audit_vu")
      const dejaPlusAvance = currentIdx >= 0 && currentIdx >= audituVuIdx

      await prisma.prospect.update({
        where: { id: audit.prospectId },
        data: {
          statut: dejaPlusAvance ? audit.prospect.statut : "audit_vu",
          email: audit.prospect.email ?? email,
        },
      })

      const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
      if (webhookUrl) {
        const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `📩 **LEAD ENGAGÉ** — ${audit.prospect.nom} a demandé son plan d'action par email.\nScore : ${audit.score}/100\nEmail laissé : ${email}\nTél : ${audit.prospect.telephone ?? "inconnu"}\nAudit : ${baseUrl}${audit.publicSlug}\nStatut → audit_vu`,
          }),
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const signups = await prisma.earlyAccessSignup.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json(signups)
}
