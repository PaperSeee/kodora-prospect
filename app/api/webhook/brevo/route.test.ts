import { beforeEach, afterAll, describe, expect, it } from "vitest"
import { createTestDb } from "@/test/db"

const db = createTestDb()
process.env.DATABASE_URL = db.url
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN

const { prisma } = await import("@/lib/prisma")
const { POST } = await import("./route")

function req(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

describe("POST /api/webhook/brevo — corrélation par messageId, statuts vérifiés", () => {
  let prospectId: number

  beforeEach(async () => {
    await prisma.emailEvent.deleteMany()
    await prisma.sendAttempt.deleteMany()
    await prisma.prospect.deleteMany()
    const p = await prisma.prospect.create({
      data: { nom: "Test SA", secteur: "test", statut: "en_file", email: "test@example.com" },
    })
    prospectId = p.id
    await prisma.sendAttempt.create({
      data: { prospectId, httpStatus: 201, messageId: "msg-123" },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("un webhook delivered corrélé par messageId passe le statut à contacte", async () => {
    const res = await POST(req({ event: "delivered", email: "test@example.com", "message-id": "msg-123" }))
    expect(res.status).toBe(200)
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("contacte")
  })

  it("un hard_bounce fait basculer le prospect en bounce", async () => {
    await POST(req({ event: "hard_bounce", email: "test@example.com", "message-id": "msg-123" }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("bounce")
  })

  it("un soft_bounce fait aussi basculer en bounce", async () => {
    await POST(req({ event: "soft_bounce", email: "test@example.com", "message-id": "msg-123" }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("bounce")
  })

  it("un blocked fait basculer en bloque", async () => {
    await POST(req({ event: "blocked", email: "test@example.com", "message-id": "msg-123" }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("bloque")
  })

  it("un complaint (spam) fait basculer en spam", async () => {
    await POST(req({ event: "complaint", email: "test@example.com", "message-id": "msg-123" }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("spam")
  })

  it("journalise chaque événement dans EmailEvent, y compris deferred qui ne change rien", async () => {
    await POST(req({ event: "deferred", email: "test@example.com", "message-id": "msg-123" }))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("en_file") // inchangé

    const events = await prisma.emailEvent.findMany({ where: { prospectId } })
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe("deferred")
    expect(events[0].messageId).toBe("msg-123")
  })

  it("corrèle par messageId même si deux prospects partagent un email (cas limite documenté)", async () => {
    // Un même messageId identifie un envoi précis, contrairement à l'email
    // seul qui peut correspondre à plusieurs prospects/campagnes.
    const other = await prisma.prospect.create({
      data: { nom: "Autre SA", secteur: "test", statut: "en_file", email: "test@example.com" },
    })
    await prisma.sendAttempt.create({ data: { prospectId: other.id, httpStatus: 201, messageId: "msg-999" } })

    await POST(req({ event: "delivered", email: "test@example.com", "message-id": "msg-999" }))

    const untouched = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: other.id } })
    expect(untouched.statut).toBe("en_file")
    expect(updated.statut).toBe("contacte")
  })

  it("accepte un batch (tableau) d'événements en un seul appel", async () => {
    await POST(req([
      { event: "delivered", email: "test@example.com", "message-id": "msg-123" },
      { event: "opened", email: "test@example.com", "message-id": "msg-123" },
    ]))
    const p = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(p.statut).toBe("contacte")
    expect(p.emailOuvert).toBe(true)
  })
})
