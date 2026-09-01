import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "@/test/db"

const db = createTestDb()
process.env.DATABASE_URL = db.url
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN

const { prisma } = await import("@/lib/prisma")
const { PATCH } = await import("./route")

function patchReq(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0]
}

describe("PATCH /api/prospects/[id] — statut rdv exige une date", () => {
  let prospectId: number

  beforeEach(async () => {
    await prisma.prospect.deleteMany()
    const p = await prisma.prospect.create({
      data: { nom: "Test SA", secteur: "test", statut: "a_contacter" },
    })
    prospectId = p.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("refuse statut=rdv sans rdvAt", async () => {
    const res = await PATCH(patchReq({ statut: "rdv" }), { params: Promise.resolve({ id: String(prospectId) }) })
    expect(res.status).toBe(400)

    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("a_contacter") // inchangé
  })

  it("refuse statut=rdv avec une date invalide", async () => {
    const res = await PATCH(
      patchReq({ statut: "rdv", rdvAt: "pas-une-date" }),
      { params: Promise.resolve({ id: String(prospectId) }) }
    )
    expect(res.status).toBe(400)
  })

  it("accepte statut=rdv avec une date valide", async () => {
    const res = await PATCH(
      patchReq({ statut: "rdv", rdvAt: "2026-09-15T10:00:00.000Z" }),
      { params: Promise.resolve({ id: String(prospectId) }) }
    )
    expect(res.status).toBe(200)

    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("rdv")
    expect(prospect.rdvAt?.toISOString()).toBe("2026-09-15T10:00:00.000Z")
  })

  it("laisse passer les autres statuts sans exiger de date", async () => {
    const res = await PATCH(
      patchReq({ statut: "a_repondu" }),
      { params: Promise.resolve({ id: String(prospectId) }) }
    )
    expect(res.status).toBe(200)
  })
})
