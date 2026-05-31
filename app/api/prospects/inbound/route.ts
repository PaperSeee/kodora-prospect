import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

// POST /api/prospects/inbound
// Crée un prospect "inbound" depuis LokalSEO (visiteur organique qui a fourni son email)
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { nom, email, siteWeb, ville, scoreLokalSEO } = body

  if (!nom || !email) {
    return NextResponse.json({ error: "nom and email required" }, { status: 400 })
  }

  // Vérifie si le prospect existe déjà par email
  const existing = await prisma.prospect.findFirst({ where: { email } })
  if (existing) {
    return NextResponse.json({ id: existing.id, alreadyExists: true })
  }

  const prospect = await prisma.prospect.create({
    data: {
      nom,
      email,
      siteWeb: siteWeb || null,
      ville: ville || "Bruxelles",
      secteur: "Indépendant",
      statut: "lead_chaud",
      score: scoreLokalSEO ?? 0,
      angle: "Lead inbound LokalSEO — a fait son propre audit",
      goldStar: true,
    },
  })

  // Notif immédiate
  const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `⭐ **LEAD INBOUND** — ${nom} vient de faire son propre audit sur LokalSEO !\nEmail : ${email}\nSite : ${siteWeb || "non renseigné"}\nScore : ${scoreLokalSEO ?? "?"}/100\nStatut : lead_chaud`,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ id: prospect.id, created: true })
}
