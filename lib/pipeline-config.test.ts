import { describe, expect, it } from "vitest"
import { SECTEURS_ROTATION } from "./pipeline-config"

describe("SECTEURS_ROTATION — retargeté sur les métiers d'urgence", () => {
  const ANCIENS_SECTEURS_BUREAU = ["comptable", "avocat", "notaire", "photographe", "agence immobilière", "fiduciaire"]

  it("ne cible plus les professions de bureau de l'ancienne offre site vitrine", () => {
    const tousSecteurs = SECTEURS_ROTATION.flat()
    for (const s of ANCIENS_SECTEURS_BUREAU) {
      expect(tousSecteurs, `"${s}" ne devrait plus apparaître dans la rotation`).not.toContain(s)
    }
  })

  it("chaque secteur de la rotation a un mapping OSM (sinon le sourcing gratuit renvoie 0 résultat)", async () => {
    // Import dynamique : SECTEUR_OSM n'est pas exporté publiquement, on lit
    // le fichier source pour vérifier la présence de chaque clé plutôt que
    // de dupliquer la table ici (qui divergerait silencieusement).
    const fs = await import("fs")
    const path = await import("path")
    const source = fs.readFileSync(path.resolve(__dirname, "source-overpass.ts"), "utf-8")

    const tousSecteurs = new Set(SECTEURS_ROTATION.flat())
    for (const secteur of tousSecteurs) {
      expect(source, `"${secteur}" doit avoir une entrée dans SECTEUR_OSM (lib/source-overpass.ts)`).toContain(`"${secteur}":`)
    }
  })
})
