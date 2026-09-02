import { beforeEach, afterAll, describe, expect, it } from "vitest"
import { createTestDb } from "@/test/db"

const db = createTestDb()
process.env.DATABASE_URL = db.url
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
process.env.KODORA_INTERNAL_API_KEY = "test-key"

const { prisma } = await import("@/lib/prisma")
const { POST } = await import("./route")

function req(body: unknown) {
  return {
    headers: { get: (k: string) => (k === "x-api-key" ? "test-key" : null) },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]
}

describe("POST /api/audits/track-cta — clic robot filtré comme track-view", () => {
  let prospectId: number
  let slug: string

  beforeEach(async () => {
    await prisma.emailEvent.deleteMany()
    await prisma.audit.deleteMany()
    await prisma.prospect.deleteMany()
    const p = await prisma.prospect.create({
      data: { nom: "Test SA", secteur: "test", statut: "contacte", email: "test@example.com" },
    })
    prospectId = p.id
    slug = `slug-${p.id}-${Date.now()}`
    await prisma.audit.create({ data: { prospectId, publicSlug: slug, score: 50, problemesJson: "[]" } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("un clic humain passe le statut à cta_clique, jamais rdv", async () => {
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128" }))
    expect(res.status).toBe(200)
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("cta_clique")
  })

  it("un clic depuis un scanner de sécurité connu ne change pas le statut", async () => {
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 BarracudaSentinel/1.0" }))
    const body = await res.json()
    expect(body.looksHuman).toBe(false)
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("contacte") // inchangé
  })

  it("un clic < 30s après delivered ne change pas le statut, même avec un UA humain", async () => {
    await prisma.emailEvent.create({
      data: { prospectId, event: "delivered", payload: "{}", receivedAt: new Date() },
    })
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128" }))
    const body = await res.json()
    expect(body.looksHuman).toBe(false)
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("contacte")
  })

  it("n'écrit jamais statut=rdv, quel que soit l'appel", async () => {
    await POST(req({ slug, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128" }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).not.toBe("rdv")
  })
})
