import { NextRequest, NextResponse } from "next/server"
import { generateEmailBatch } from "@/lib/generate-emails"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const count = await generateEmailBatch({ regenerate: body.regenerate })
  return NextResponse.json({ count })
}
