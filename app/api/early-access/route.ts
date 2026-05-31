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

  const { email, url } = await req.json()
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })

  await prisma.earlyAccessSignup.upsert({
    where: { email },
    create: { email, url: url || null },
    update: { url: url || undefined },
  })

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const signups = await prisma.earlyAccessSignup.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json(signups)
}
