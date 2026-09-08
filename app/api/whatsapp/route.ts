import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CONTACT_COOLDOWN_JOURS } from "@/lib/pipeline-config"

// Liste des prospects pour le tableau WhatsApp (/whatsapp), triés par score
// décroissant — même tri que le canal email qu'il remplace (voir
// app/api/pipeline/run/route.ts). Exclut par défaut tout prospect dont le
// dernier contact WhatsApp date de moins de CONTACT_COOLDOWN_JOURS ; le
// filtre commune/métier reste côté client (liste déjà petite, pas besoin
// d'aller-retour serveur par filtre).
export async function GET() {
  const cooldownDepuis = new Date(Date.now() - CONTACT_COOLDOWN_JOURS * 86_400_000)

  const [prospects, contactsRecents] = await Promise.all([
    prisma.prospect.findMany({
      where: { telephone: { not: null } },
      orderBy: { score: "desc" },
      select: {
        id: true,
        nom: true,
        secteur: true,
        ville: true,
        telephone: true,
        siteWeb: true,
        note: true,
        avis: true,
        angle: true,
        score: true,
        goldStar: true,
      },
    }),
    prisma.whatsappContact.findMany({
      where: { contactedAt: { gte: cooldownDepuis } },
      select: { prospectId: true, contactedAt: true },
    }),
  ])

  const recemmentContactes = new Map(contactsRecents.map((c) => [c.prospectId, c.contactedAt]))

  const rows = prospects
    .filter((p) => !recemmentContactes.has(p.id))
    .map((p) => ({ ...p, dernierContactAt: null as string | null }))

  return NextResponse.json({ rows, cooldownJours: CONTACT_COOLDOWN_JOURS })
}
