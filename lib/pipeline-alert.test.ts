import { describe, expect, it } from "vitest"
import { shouldAlertOnRunOutcome } from "./pipeline-alert"

describe("shouldAlertOnRunOutcome", () => {
  it("alerte si des prospects étaient éligibles mais sent === 0", () => {
    const msg = shouldAlertOnRunOutcome({ eligible: 12, sent: 0, failed: 0 })
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/12/)
  })

  it("n'alerte pas si personne n'était éligible (rien à envoyer, normal)", () => {
    expect(shouldAlertOnRunOutcome({ eligible: 0, sent: 0, failed: 0 })).toBeNull()
  })

  it("n'alerte pas sur un run sain", () => {
    expect(shouldAlertOnRunOutcome({ eligible: 20, sent: 20, failed: 0 })).toBeNull()
  })

  it("alerte si le taux d'échec dépasse 20%", () => {
    const msg = shouldAlertOnRunOutcome({ eligible: 10, sent: 7, failed: 3 })
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/30%/)
  })

  it("n'alerte pas à exactement 20% d'échec (borne)", () => {
    expect(shouldAlertOnRunOutcome({ eligible: 10, sent: 8, failed: 2 })).toBeNull()
  })
})
