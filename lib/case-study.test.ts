import { describe, expect, it } from "vitest"
import { caseStudyReady } from "./case-study"

describe("caseStudyReady", () => {
  it("est faux tant que config/case-study.json contient des TODO", () => {
    // État réel du fichier au 2026-09-02 : appels/coutParAppel valent "TODO"
    // (disponible le 2026-09-08, voir config/case-study.json). Ce test
    // documente et verrouille cet état — il doit passer à `true` une fois
    // les vraies valeurs renseignées, pas avant.
    expect(caseStudyReady()).toBe(false)
  })
})
