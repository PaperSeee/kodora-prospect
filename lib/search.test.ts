import { describe, it, expect } from "vitest"
import { matchesQuery, stripEmoji, normalizeText, onlyDigits } from "./search"

const base = {
  nom: "Serrurier & vitrier Etterbeek",
  secteur: "serrurier",
  ville: "Bruxelles",
  telephone: "0493 46 24 76",
  siteWeb: "https://www.serrurier-etterbeek.be",
}

describe("matchesQuery", () => {
  it("retourne tout sur une requête vide", () => {
    expect(matchesQuery(base, "")).toBe(true)
    expect(matchesQuery(base, "   ")).toBe(true)
  })

  it("trouve par nom, sans tenir compte de la casse", () => {
    expect(matchesQuery(base, "etterbeek")).toBe(true)
    expect(matchesQuery(base, "SERRURIER")).toBe(true)
  })

  it("ignore les accents", () => {
    expect(matchesQuery({ ...base, secteur: "électricien" }, "electricien")).toBe(true)
    expect(matchesQuery({ ...base, ville: "Forêt" }, "foret")).toBe(true)
  })

  // Le cas qui compte : un prospect rappelle, on tape les chiffres vus sur
  // l'écran du téléphone, quel que soit le formatage stocké en base.
  it("trouve par numéro quel que soit le formatage", () => {
    expect(matchesQuery(base, "0493462476")).toBe(true)
    expect(matchesQuery(base, "493 46 24 76")).toBe(true)
    expect(matchesQuery(base, "+32 493 46 24 76")).toBe(true)
    expect(matchesQuery(base, "462476")).toBe(true)
  })

  it("ne fait pas de recherche texte sur une requête purement numérique", () => {
    // "2024" ne doit pas remonter un prospect nommé "Toiture 2024" via le nom
    expect(matchesQuery({ ...base, nom: "Toiture 2024", telephone: null }, "2024")).toBe(false)
  })

  it("cherche aussi dans le site web", () => {
    expect(matchesQuery(base, "serrurier-etterbeek")).toBe(true)
  })

  it("gère un prospect sans téléphone ni site", () => {
    const sans = { ...base, telephone: null, siteWeb: null }
    expect(matchesQuery(sans, "0493")).toBe(false)
    expect(matchesQuery(sans, "etterbeek")).toBe(true)
  })
})

describe("stripEmoji", () => {
  it("nettoie les noms Google Places", () => {
    expect(stripEmoji("EC HABITAT 🏠 TOITURE BRUXELLES ✅ SOS FUITE 💧")).toBe(
      "EC HABITAT TOITURE BRUXELLES SOS FUITE"
    )
  })

  it("nettoie les angles générés avant sept. 2026", () => {
    expect(stripEmoji("⭐ Cible en or — Site vieillissant + 389 avis")).toBe(
      "Cible en or — Site vieillissant + 389 avis"
    )
  })

  it("laisse intact un texte sans emoji", () => {
    expect(stripEmoji("Site à améliorer")).toBe("Site à améliorer")
  })
})

describe("helpers", () => {
  it("normalizeText enlève accents et casse", () => {
    expect(normalizeText("Électricien")).toBe("electricien")
  })

  it("onlyDigits ne garde que les chiffres", () => {
    expect(onlyDigits("+32 493 46 24 76")).toBe("32493462476")
  })
})
