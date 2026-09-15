import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CONTACT_COOLDOWN_JOURS, secteurPrioriteTier, SECTEURS_SANS_SITE } from "@/lib/pipeline-config"

// Liste des prospects pour le tableau WhatsApp (/whatsapp), triés à DEUX
// NIVEAUX : d'abord le rang de priorité métier (secteurPrioriteTier — 0 =
// site lead en forte performance, 1 = trafic mesuré plus faible, 2 =
// neutre), puis le score de diagnostic décroissant à l'intérieur d'un même
// rang.
//
// Un bonus additif au score (essayé d'abord, le 2026-09-15) ne suffisait
// pas : scoreProspect plafonne à 100, et une bonne partie des ~2500
// prospects déjà en base l'atteint déjà (site pourri + beaucoup d'avis =
// plusieurs flags cumulés, écrêtés à 100) — un menuisier à 100 restait donc
// toujours devant un nuisibles à 85+15, alors que c'est exactement l'ordre
// qu'on veut inverser. Le tri à deux niveaux n'a pas ce problème : le rang
// prime toujours sur le score, quel que soit l'écart de score.
//
// Le rang est calculé ici, en lecture, plutôt que réécrit en base : les
// prospects déjà sourcés doivent aussi remonter selon les métiers qui
// performent réellement (clics Search Console des sites leads), sans qu'on
// perde la trace du score de diagnostic d'origine (utile ailleurs —
// sourcing, audit). Le bonus additif (secteurPrioriteBonus) reste appliqué
// au score stocké des nouveaux prospects sourcés (lib/source-prospects.ts),
// où le score n'est pas encore saturé et où ça fait une vraie différence
// dans l'ordre d'envoi.
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
        secteurTier: secteurPrioriteTier(p.secteur),
        secteurSansSite: SECTEURS_SANS_SITE.has(p.secteur.toLowerCase().trim()),
      }
    })
    .sort((a, b) => a.secteurTier - b.secteurTier || b.score - a.score)

  return NextResponse.json({ rows, cooldownJours: CONTACT_COOLDOWN_JOURS })
}
