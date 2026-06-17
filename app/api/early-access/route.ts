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
      // Récupère l'email s'il manque, et ne rétrograde jamais un lead déjà chaud/rdv.
      const dejaChaud = ["lead_chaud", "rdv"].includes(audit.prospect.statut)
      await prisma.prospect.update({
        where: { id: audit.prospectId },
        data: {
          statut: dejaChaud ? audit.prospect.statut : "lead_chaud",
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
            content: `📩 **LEAD CHAUD** — ${audit.prospect.nom} a demandé son plan d'action par email.\nScore : ${audit.score}/100\nEmail laissé : ${email}\nTél : ${audit.prospect.telephone ?? "inconnu"}\nAudit : ${baseUrl}${audit.publicSlug}\nStatut → lead_chaud`,
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
