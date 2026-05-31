import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateAudit } from "@/lib/audit-generator"

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key")
  return key === process.env.KODORA_INTERNAL_API_KEY
}

// POST /api/audits/generate-batch
// Body: { prospectIds: number[] }
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const prospectIds: number[] = body.prospectIds ?? []

  if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
    return NextResponse.json({ error: "prospectIds array required" }, { status: 400 })
  }

  // Concurrence limitée à 3
  const results: { prospectId: number; slug?: string; auditUrl?: string; error?: string }[] = []
  const chunks: number[][] = []
  for (let i = 0; i < prospectIds.length; i += 3) {
    chunks.push(prospectIds.slice(i, i + 3))
  }

  const baseUrl = process.env.PUBLIC_RAPPORT_BASE_URL || "http://localhost:3001/rapport/"

  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(chunk.map((id) => generateAudit(id)))
    chunkResults.forEach((r, idx) => {
      const prospectId = chunk[idx]
      if (r.status === "fulfilled") {
        results.push({
          prospectId,
          slug: r.value.publicSlug,
          auditUrl: `${baseUrl}${r.value.publicSlug}`,
        })
      } else {
        results.push({ prospectId, error: String(r.reason) })
      }
    })
  }

  return NextResponse.json({ results, generated: results.filter((r) => r.slug).length })
}
