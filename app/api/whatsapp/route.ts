import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CONTACT_COOLDOWN_JOURS, secteurPrioriteBonus, SECTEURS_SANS_SITE } from "@/lib/pipeline-config"

// Liste des prospects pour le tableau WhatsApp (/whatsapp), triés par score
// décroissant, score augmenté d'un bonus par secteur (voir
// secteurPrioriteBonus) — même tri que le canal email qu'il remplace (voir
// app/api/pipeline/run/route.ts).
//
// Le bonus est appliqué ici, en lecture, plutôt que réécrit sur la colonne
// `score` en base : les ~2500 prospects déjà sourcés avant le rebranchement
// du 2026-09-15 doivent aussi remonter selon les métiers qui performent
// réellement (clics Search Console des sites leads), sans qu'on perde la
// trace du score de diagnostic d'origine (state utile ailleurs — sourcing,
// audit). Seuls les nouveaux prospects sourcés après cette date ont le
// bonus écrit dans leur score stocké (voir lib/source-prospects.ts).
//
// On renvoie TOUS les prospects joignables, chacun avec la date de son
// dernier contact WhatsApp (null s'il n'a jamais été contacté), et c'est le
// client qui répartit entre l'onglet "À contacter" et l'onglet "Contactés".
// Auparavant les contactés étaient filtrés ici : ils disparaissaient alors
// de l'interface, impossible de retrouver quelqu'un qui rappelle. La
// répartition doit rester côté client pour que la recherche porte aussi sur
// les contactés.
export async function GET() {
  const [prospects, contacts] = await Promise.all([
    prisma.prospect.findMany({
      where: { telephone: { not: null } },
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
        statut: true,
      },
    }),
    prisma.whatsappContact.findMany({
      select: { prospectId: true, contactedAt: true },
    }),
  ])

  const contactesAt = new Map(contacts.map((c) => [c.prospectId, c.contactedAt]))

  // new Date(...) plutôt que .toISOString() direct : selon l'adaptateur
  // (better-sqlite3 en local, libsql/Turso en prod) contactedAt arrive en
  // Date ou en chaîne, et le client doit recevoir de l'ISO dans les deux cas.
  const rows = prospects
    .map((p) => {
      const at = contactesAt.get(p.id)
      return {
        ...p,
        contactedAt: at ? new Date(at).toISOString() : null,
        triScore: Math.min(p.score + secteurPrioriteBonus(p.secteur), 100),
        secteurSansSite: SECTEURS_SANS_SITE.has(p.secteur.toLowerCase().trim()),
      }
    })
    .sort((a, b) => b.triScore - a.triScore)

  return NextResponse.json({ rows, cooldownJours: CONTACT_COOLDOWN_JOURS })
}
