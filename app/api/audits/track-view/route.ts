import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isLikelyBotUserAgent, isWithinScannerWindow } from "@/lib/bot-detect"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

// POST /api/audits/track-view
// Appelé par LokalSEO quand un audit est consulté
// Body: { slug: string, userAgent?: string } — userAgent est celui du
// visiteur final, transmis par LokalSEO (l'appel lui-même est serveur à
// serveur donc req.headers ne porte pas l'UA du visiteur).
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug, userAgent } = await req.json()
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

  // Une vue de page n'est pas un lead intéressé — et une partie de ces vues
  // vient de scanners de sécurité d'entreprise qui ouvrent les liens des
  // emails automatiquement. On filtre par UA connu ET par délai depuis la
  // remise de l'email (< 30s = trop tôt pour un humain).
  const lastDelivered = await prisma.emailEvent.findFirst({
    where: { prospectId: audit.prospectId, event: "delivered" },
    orderBy: { receivedAt: "desc" },
  })
  const looksHuman =
    !isLikelyBotUserAgent(userAgent) &&
    !isWithinScannerWindow(lastDelivered?.receivedAt ?? null, now)

  if (isFirstView && looksHuman && audit.prospect.statut === "contacte") {
    await prisma.prospect.update({
      where: { id: audit.prospectId },
      data: { statut: "audit_vu" },
    })

    // Notif Discord/webhook
    const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
    if (webhookUrl) {
      const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `👁️ **${audit.prospect.nom}** vient de consulter son audit pour la première fois !\nScore : ${audit.score}/100\nAudit : ${baseUrl}${audit.publicSlug}\nStatut → audit_vu`,
        }),
      }).catch(() => {})
    }

    // Programmer relance à chaud via Brevo (60 min)
    scheduleWarmFollowUp(audit.prospect, audit.publicSlug).catch(() => {})
  }

  return NextResponse.json({ ok: true, isFirstView, looksHuman, viewCount: audit.viewCount + 1 })
}

// TODO(2026-09-08+) : réactiver une fois le texte remplacé. L'offre "on
// corrige l'ensemble en 7 jours (dès 299 €)" est l'ancien site vitrine, plus
// d'actualité — le nouveau contenu dépend d'une étude de cas qui n'existera
// que le 8 septembre. Désactivé pour ne pas envoyer une offre obsolète en
// automatique pendant que ce point traîne. Ne pas réécrire le texte ici en
// attendant : voir avec Ilias pour le nouveau contenu avant de dé-commenter
// le corps ci-dessous.
async function scheduleWarmFollowUp(
  _prospect: { id: number; nom: string; email: string | null; secteur: string },
  _slug: string
): Promise<void> {
  return
  /*
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
      sender: { name: "Ilias — Kodora", email: process.env.BREVO_SENDER_EMAIL ?? "contact@kodora.eu" },
      replyTo: { name: "Ilias — Kodora", email: process.env.BREVO_REPLY_TO ?? "contact@kodora.eu" },
      to: [{ email: prospect.email }],
      subject: "Une question sur votre audit ?",
      textContent: `Bonjour ${prenom},

Vous avez jeté un œil à votre audit — merci. Le point le plus rentable à corriger en premier dépend de votre situation : je peux vous dire lequel attaquer en deux lignes si vous me répondez.

Et si vous voulez qu'on s'en occupe, on corrige l'ensemble en 7 jours (dès 299 €).

Le rapport reste accessible ici : ${baseUrl}${slug}

Bonne journée,
Ilias — Kodora

P.S. Si vous n'êtes pas intéressé, ignorez simplement ce message.`,
      scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      tags: ["relance-chaude"],
    }),
  })
  */
}
