import { describe, expect, it } from "vitest"
import {
  adsEmail1Observation,
  adsEmail2Offre,
  adsEmail3Objection,
  adsEmail4Sortie,
  noSiteEmailTemplate,
  CONTACT_PHONE,
} from "./email-templates"

describe("adsEmail1Observation", () => {
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
      adsEmail3Objection("Ixelles").corps,
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

describe("noSiteEmailTemplate — offre secondaire, site vitrine", () => {
  it("mentionne l'offre site vitrine et le nouveau numéro", () => {
    const { corps } = noSiteEmailTemplate("Test SA", "plombier", "Ixelles", 12)
    expect(corps).toContain("299")
    expect(corps).toContain(CONTACT_PHONE)
  })
})
