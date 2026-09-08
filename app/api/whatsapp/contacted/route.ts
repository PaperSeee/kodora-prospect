import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Journal des prospects contactés via WhatsApp — voir WhatsappContact dans
// schema.prisma pour le pourquoi d'une table plutôt que data/contacted.json
// (filesystem Vercel éphémère). upsert : re-cocher un prospect déjà présent
// rafraîchit juste sa date, ce qui est le comportement voulu (redémarre le
// cooldown de 90 jours depuis le contact le plus récent).
export async function POST(req: NextRequest) {
  const { prospectId } = await req.json()
  const id = Number(prospectId)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "prospectId invalide" }, { status: 400 })
  }

  const contact = await prisma.whatsappContact.upsert({
    where: { prospectId: id },
    create: { prospectId: id },
    update: { contactedAt: new Date() },
  })

  return NextResponse.json({ ok: true, contactedAt: contact.contactedAt })
}

// Décoche : supprime l'entrée du journal (erreur de manip, ou "je veux le
// recontacter tout de suite").
export async function DELETE(req: NextRequest) {
  const { prospectId } = await req.json()
  const id = Number(prospectId)
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "prospectId invalide" }, { status: 400 })
  }

  await prisma.whatsappContact.deleteMany({ where: { prospectId: id } })
  return NextResponse.json({ ok: true })
}
