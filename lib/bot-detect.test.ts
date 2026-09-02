import { describe, expect, it } from "vitest"
import { isLikelyBotUserAgent, isWithinScannerWindow, SCANNER_DELAY_THRESHOLD_MS } from "./bot-detect"

describe("isLikelyBotUserAgent", () => {
  it("détecte les scanners de sécurité d'entreprise connus", () => {
    expect(isLikelyBotUserAgent("Microsoft Office Outlook Safe Links Scanner")).toBe(true)
    expect(isLikelyBotUserAgent("Mozilla/5.0 BarracudaSentinel/1.0")).toBe(true)
    expect(isLikelyBotUserAgent("Proofpoint URL Defense")).toBe(true)
    expect(isLikelyBotUserAgent("Mimecast Email Security")).toBe(true)
  })

  it("détecte les crawlers/bots génériques", () => {
    expect(isLikelyBotUserAgent("Googlebot/2.1")).toBe(true)
    expect(isLikelyBotUserAgent("curl/8.4.0")).toBe(true)
    expect(isLikelyBotUserAgent("python-requests/2.31")).toBe(true)
  })

  it("ne signale pas un navigateur humain normal", () => {
    expect(isLikelyBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36")).toBe(false)
    expect(isLikelyBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe(false)
  })

  it("ne conclut pas sur une absence d'UA", () => {
    expect(isLikelyBotUserAgent(null)).toBe(false)
    expect(isLikelyBotUserAgent(undefined)).toBe(false)
    expect(isLikelyBotUserAgent("")).toBe(false)
  })
})

describe("isWithinScannerWindow", () => {
  const delivered = new Date("2026-09-01T10:00:00.000Z")

  it("signale une vue < 30s après la remise comme suspecte", () => {
    const viewed = new Date(delivered.getTime() + 5_000)
    expect(isWithinScannerWindow(delivered, viewed)).toBe(true)
  })

  it("n'est pas suspecte pile à la limite ou au-delà", () => {
    const atThreshold = new Date(delivered.getTime() + SCANNER_DELAY_THRESHOLD_MS)
    const after = new Date(delivered.getTime() + 60_000)
    expect(isWithinScannerWindow(delivered, atThreshold)).toBe(false)
    expect(isWithinScannerWindow(delivered, after)).toBe(false)
  })

  it("sans événement delivered connu, ne peut rien conclure", () => {
    expect(isWithinScannerWindow(null, new Date())).toBe(false)
  })

  it("ignore une vue antérieure à la remise (horloge/désordre d'événements)", () => {
    const before = new Date(delivered.getTime() - 5_000)
    expect(isWithinScannerWindow(delivered, before)).toBe(false)
  })
})
