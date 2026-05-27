import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const secteur = searchParams.get("secteur") ?? ""
  const sortBy = searchParams.get("sortBy") ?? "score"

  const prospects = await prisma.prospect.findMany({
    where: {
      ...(search ? { nom: { contains: search } } : {}),
      ...(secteur ? { secteur } : {}),
    },
    orderBy: sortBy === "score" ? { score: "desc" } : { createdAt: "desc" },
  })

  return NextResponse.json(prospects)
}
