import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

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
