import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  // statut="rdv" est la seule action qui déclenche un vrai rendez-vous côté
  // business : elle ne peut venir que d'ici (interface manuelle), jamais
  // d'un tracking automatique, et exige une date. Sans rdvAt, on refuse —
  // pas de RDV fantôme.
  if (body.statut === "rdv") {
    const rdvAt = body.rdvAt ?? null
    if (!rdvAt || Number.isNaN(new Date(rdvAt).getTime())) {
      return NextResponse.json(
        { error: "rdvAt (date du rendez-vous) requis pour passer un prospect en statut rdv" },
        { status: 400 }
      )
    }
    body.rdvAt = new Date(rdvAt)
  }

  const prospect = await prisma.prospect.update({
    where: { id: parseInt(id, 10) },
    data: body,
  })

  return NextResponse.json(prospect)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.prospect.delete({ where: { id: parseInt(id, 10) } })
  return NextResponse.json({ ok: true })
}
