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

describe("POST /api/audits/track-view — vue de page ≠ lead chaud", () => {
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
    await prisma.audit.create({
      data: { prospectId, publicSlug: slug, score: 50, problemesJson: "[]" },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("une vue humaine passe le statut à audit_vu, pas lead_chaud", async () => {
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128" }))
    expect(res.status).toBe(200)
    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("audit_vu")
  })

  it("une vue depuis un scanner de sécurité connu ne change pas le statut", async () => {
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 BarracudaSentinel/1.0" }))
    const body = await res.json()
    expect(body.looksHuman).toBe(false)
    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("contacte") // inchangé
  })

  it("une vue < 30s après l'événement delivered ne change pas le statut, même sans UA suspect", async () => {
    const deliveredAt = new Date()
    await prisma.emailEvent.create({
      data: { prospectId, event: "delivered", payload: "{}", receivedAt: deliveredAt },
    })
    // Vue quasi immédiate (dans le test, "now" sera à quelques ms de deliveredAt)
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128" }))
    const body = await res.json()
    expect(body.looksHuman).toBe(false)
    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("contacte")
  })

  it("une vue 60s+ après delivered, avec UA humain, change bien le statut", async () => {
    const deliveredAt = new Date(Date.now() - 60_000)
    await prisma.emailEvent.create({
      data: { prospectId, event: "delivered", payload: "{}", receivedAt: deliveredAt },
    })
    const res = await POST(req({ slug, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128" }))
    const body = await res.json()
    expect(body.looksHuman).toBe(true)
    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("audit_vu")
  })
})
