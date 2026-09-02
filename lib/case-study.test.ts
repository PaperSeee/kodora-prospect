import { describe, expect, it } from "vitest"
import { caseStudy, caseStudyReady } from "./case-study"

describe("caseStudyReady", () => {
  it("est faux tant que config/case-study.json contient des TODO", () => {
    // État réel du fichier au 2026-09-02 : appels/coutParAppel valent "TODO"
    // (disponible le 2026-09-08, voir config/case-study.json). Ce test
    // documente et verrouille cet état — il doit passer à `true` une fois
    // les vraies valeurs renseignées, pas avant.
    expect(caseStudyReady()).toBe(false)
  })

  it("les clics Google Ads réels ne sont jamais confondus avec des appels", () => {
    // clics/coutTotal/coutParClic viennent d'un vrai relevé Google Ads
    // (102 clics, 258,04€, campagne débouchage Bruxelles+Wallonie,
    // 26 août – 1 sept. 2026), mais 0 conversion était trackée sur cette
    // période — donc pas de vrai nombre d'appels reçus. caseStudyReady()
    // ne doit jamais se déclencher sur la présence de clics : appels/
    // coutParAppel restent la seule condition, et un email ne doit jamais
    // pouvoir présenter caseStudy.clics comme un nombre d'appels.
    expect(caseStudy.clics).toBeGreaterThan(0)
    expect(caseStudy.appels).toBe("TODO")
    expect(caseStudyReady()).toBe(false)
  })
})
