import { beforeEach, afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { createTestDb } from "@/test/db"

const db = createTestDb()
process.env.DATABASE_URL = db.url
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
process.env.BREVO_API_KEY = "test-brevo-key"

const { prisma } = await import("@/lib/prisma")
const { sendBrevoEmail } = await import("./send-brevo-email")

describe("sendBrevoEmail — chaque tentative journalisée, messageId stocké", () => {
  let prospectId: number

  beforeEach(async () => {
    await prisma.sendAttempt.deleteMany()
    await prisma.prospect.deleteMany()
    const p = await prisma.prospect.create({
      data: { nom: "Test SA", secteur: "test", statut: "a_contacter", email: "test@example.com" },
    })
    prospectId = p.id
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await prisma.$disconnect()
    db.cleanup()
  })

  it("un envoi accepté (res.ok) stocke le messageId et passe en_file, pas contacte", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: "brevo-msg-abc" }),
    }))

    const result = await sendBrevoEmail({
      prospectId,
      to: { email: "test@example.com", name: "Test SA" },
      subject: "Sujet",
      textContent: "Corps",
    })

    expect(result.ok).toBe(true)
    expect(result.messageId).toBe("brevo-msg-abc")

    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("en_file")

    const attempts = await prisma.sendAttempt.findMany({ where: { prospectId } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].messageId).toBe("brevo-msg-abc")
    expect(attempts[0].httpStatus).toBe(201)
  })

  it("un envoi refusé par Brevo journalise l'échec sans changer le statut", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "invalid_parameter" }),
    }))

    const result = await sendBrevoEmail({
      prospectId,
      to: { email: "test@example.com", name: "Test SA" },
      subject: "Sujet",
      textContent: "Corps",
    })

    expect(result.ok).toBe(false)

    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })
    expect(prospect.statut).toBe("a_contacter") // inchangé

    const attempts = await prisma.sendAttempt.findMany({ where: { prospectId } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].httpStatus).toBe(400)
    expect(attempts[0].error).not.toBeNull()
  })

  it("une exception réseau journalise quand même la tentative (pas de panne silencieuse)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    const result = await sendBrevoEmail({
      prospectId,
      to: { email: "test@example.com", name: "Test SA" },
      subject: "Sujet",
      textContent: "Corps",
    })

    expect(result.ok).toBe(false)
    const attempts = await prisma.sendAttempt.findMany({ where: { prospectId } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0].error).toContain("network down")
  })
})
