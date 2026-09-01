import { beforeEach, afterAll, describe, expect, it } from "vitest"
import { createTestDb } from "@/test/db"

const db = createTestDb()
process.env.DATABASE_URL = db.url
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN

const { prisma } = await import("@/lib/prisma")
const { GET } = await import("./route")

describe("GET /api/stats — pas de métrique ambiguë", () => {
  beforeEach(async () => {
    await prisma.prospect.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("n'expose plus 'chauds' et expose scoreSuperieur50 à la place", async () => {
    await prisma.prospect.create({ data: { nom: "A", secteur: "x", score: 80, statut: "contacte" } })
    await prisma.prospect.create({ data: { nom: "B", secteur: "x", score: 10, statut: "contacte" } })

    const body = await (await GET()).json()

    expect(body).not.toHaveProperty("chauds")
    expect(body.scoreSuperieur50).toBe(1)
  })

  it("expose une definition pour chaque métrique numérique/objet du payload", async () => {
    const body = await (await GET()).json()
    const metricKeys = Object.keys(body).filter((k) => k !== "definitions")
    for (const key of metricKeys) {
      expect(body.definitions, `definitions manque une entrée pour "${key}"`).toHaveProperty(key)
      expect(typeof body.definitions[key]).toBe("string")
      expect(body.definitions[key].length).toBeGreaterThan(0)
    }
  })

  it("scoreSuperieur50 et parStatut.lead_chaud ne coexistent plus sous un nom ambigu commun", async () => {
    const body = await (await GET()).json()
    // "lead_chaud" ne doit plus apparaître comme clé de statut vivante — le
    // nouveau vocabulaire utilise audit_vu / cta_clique / rdv.
    expect(body.parStatut).not.toHaveProperty("lead_chaud")
  })
})
