import { describe, expect, it } from "vitest"
import {
  adsEmail1Observation,
  adsEmail1ObservationNL,
  adsEmail2Offre,
  adsEmail2OffreNL,
  adsEmail3Objection,
  adsEmail3ObjectionNL,
  adsEmail4Sortie,
  adsEmail4SortieNL,
  noSiteEmailTemplate,
  CONTACT_PHONE,
} from "./email-templates"

describe("aucune interpolation cassée — {{, TODO, undefined ne doivent jamais partir à un prospect", () => {
  // adsEmail3Objection contenait un vrai {{métier}}/{{beroep}} jamais résolu
  // avant le 2026-09-02 (aucun appelant ne passait le secteur) — corrigé en
  // même temps que cette suite de tests, qui l'aurait attrapé.
  const CAS: Array<[string, { objet: string; corps: string }]> = [
    ["email1 fr", adsEmail1Observation("Test SA", "débouchage", { motCle: "débouchage", commune: "Ixelles" })],
    ["email1 nl", adsEmail1ObservationNL("débouchage", { motCle: "débouchage", commune: "Ixelles" })],
    ["email2 fr", adsEmail2Offre("Ixelles")],
    ["email2 nl", adsEmail2OffreNL("Ixelles")],
    ["email3 fr", adsEmail3Objection("débouchage", "Ixelles")],
    ["email3 nl", adsEmail3ObjectionNL("débouchage", "Ixelles")],
    ["email4 fr", adsEmail4Sortie()],
    ["email4 nl", adsEmail4SortieNL()],
  ]

  for (const [label, { objet, corps }] of CAS) {
    it(`${label} — objet et corps propres`, () => {
      for (const texte of [objet, corps]) {
        expect(texte, `${label}: undefined littéral`).not.toMatch(/\bundefined\b/)
        expect(texte, `${label}: TODO littéral`).not.toMatch(/\bTODO\b/)
        expect(texte, `${label}: accolades de template non résolues`).not.toMatch(/\{\{/)
      }
    })
  }
})

describe("adsEmail1Observation — grammaire et longueur", () => {
  it("n'interpole jamais le secteur brut (\"des serrurier\" est une faute)", () => {
    for (const secteur of ["serrurier", "vitrier", "nuisibles", "débouchage"]) {
      const { corps } = adsEmail1Observation("Test", secteur, { motCle: secteur, commune: "Ixelles" })
      expect(corps, `secteur="${secteur}"`).not.toMatch(new RegExp(`\\bdes ${secteur}\\b`, "i"))
    }
  })

  it("fait moins de 90 mots et ne contient aucune URL", () => {
    const { corps } = adsEmail1Observation("Débouchage Dupont", "débouchage", {
      motCle: "débouchage", commune: "Ixelles",
    })
    const nbMots = corps.trim().split(/\s+/).length
    expect(nbMots, `corps fait ${nbMots} mots`).toBeLessThan(90)
    expect(corps).not.toMatch(/https?:\/\//)
  })

  it("l'objet commence en minuscules (le nom de commune garde sa majuscule), sans ponctuation d'accroche", () => {
    const { objet } = adsEmail1Observation("Test", "débouchage", { motCle: "débouchage", commune: "Ixelles" })
    expect(objet[0]).toBe(objet[0].toLowerCase())
    expect(objet).not.toMatch(/[!?:]/)
  })

  it("cite les deux concurrents quand ils sont connus", () => {
    const { corps } = adsEmail1Observation("Débouchage Dupont", "débouchage", {
      motCle: "débouchage",
      commune: "Ixelles",
      concurrent1: "PlombierPro",
      concurrent2: "RapidDébouche",
    })
    expect(corps).toContain("PlombierPro")
    expect(corps).toContain("RapidDébouche")
    expect(corps).toContain("Ixelles")
  })

  it("utilise le repli sans nommer de faux concurrents quand ils sont inconnus", () => {
    const { corps } = adsEmail1Observation("Débouchage Dupont", "débouchage", {
      motCle: "débouchage",
      commune: "Ixelles",
      concurrent1: null,
      concurrent2: null,
    })
    expect(corps).not.toMatch(/PlombierPro|RapidDébouche/)
    expect(corps).toContain("Ixelles")
  })

  it("le premier email ne contient aucun lien cliquable", () => {
    const { corps } = adsEmail1Observation("Test", "débouchage", { motCle: "débouchage", commune: "Ixelles" })
    expect(corps).not.toMatch(/https?:\/\//)
  })

  it("porte le bon numéro de contact", () => {
    const { corps } = adsEmail1Observation("Test", "débouchage", { motCle: "débouchage", commune: "Ixelles" })
    expect(corps).toContain(CONTACT_PHONE)
  })
})

describe("séquence de suivi — chaque message est autonome", () => {
  it("email 2 contient un lien WhatsApp mais pas avant", () => {
    const e1 = adsEmail1Observation("Test", "débouchage", { motCle: "débouchage", commune: "Ixelles" })
    const e2 = adsEmail2Offre("Ixelles")
    expect(e1.corps).not.toMatch(/wa\.me/)
    expect(e2.corps).toMatch(/wa\.me/)
  })

  it("aucun des 4 messages ne contient la formule 'je me permets de revenir'", () => {
    const bodies = [
      adsEmail1Observation("Test", "débouchage", { motCle: "débouchage", commune: "Ixelles" }).corps,
      adsEmail2Offre("Ixelles").corps,
      adsEmail3Objection("débouchage", "Ixelles").corps,
      adsEmail4Sortie().corps,
    ]
    for (const corps of bodies) {
      expect(corps.toLowerCase()).not.toContain("je me permets de revenir")
      expect(corps.toLowerCase()).not.toContain("je reviens vers vous")
    }
  })

  it("le dernier message ne contient aucune fausse urgence", () => {
    const { corps } = adsEmail4Sortie()
    expect(corps.toLowerCase()).not.toMatch(/dernière chance|offre limitée|plus que \d+/)
  })
})

describe("l'email 1 dit clairement le bénéfice concret, pas juste 'être visible'", () => {
  it("mentionne le téléphone qui sonne / qui décroche en premier — pas une formule abstraite", () => {
    const { corps } = adsEmail1Observation("Test", "débouchage", { motCle: "débouchage", commune: "Ixelles" })
    expect(corps.toLowerCase()).toMatch(/décroch|appelle|téléphone/)
  })
})

describe("noSiteEmailTemplate — offre secondaire, site vitrine", () => {
  it("mentionne l'offre site vitrine et le nouveau numéro", () => {
    const { corps } = noSiteEmailTemplate("Test SA", "plombier", "Ixelles", 12)
    expect(corps).toContain("299")
    expect(corps).toContain(CONTACT_PHONE)
  })
})
