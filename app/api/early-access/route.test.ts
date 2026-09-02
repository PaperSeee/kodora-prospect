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

describe("POST /api/early-access — signal vérifié (formulaire), jamais de rétrogradation", () => {
  let prospectId: number
  let slug: string

  beforeEach(async () => {
    await prisma.audit.deleteMany()
    await prisma.prospect.deleteMany()
    const p = await prisma.prospect.create({ data: { nom: "Test SA", secteur: "test", statut: "contacte" } })
    prospectId = p.id
    slug = `slug-${p.id}-${Date.now()}`
    await prisma.audit.create({ data: { prospectId, publicSlug: slug, score: 50, problemesJson: "[]" } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("fait avancer un prospect contacte à audit_vu quand il laisse son email", async () => {
    await POST(req({ email: "lead@example.com", slug }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("audit_vu")
  })

  it("ne rétrograde jamais un prospect déjà plus avancé (ex: rdv)", async () => {
    await prisma.prospect.update({ where: { id: prospectId }, data: { statut: "rdv", rdvAt: new Date() } })
    await POST(req({ email: "lead@example.com", slug }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("rdv") // inchangé
  })

  it("ne rétrograde pas non plus depuis signe", async () => {
    await prisma.prospect.update({ where: { id: prospectId }, data: { statut: "signe" } })
    await POST(req({ email: "lead@example.com", slug }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("signe")
  })
})
