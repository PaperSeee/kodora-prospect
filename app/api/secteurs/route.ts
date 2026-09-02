import { NextResponse } from "next/server"
import { COMMUNES } from "@/lib/pipeline-config"

export const SECTEURS_LIST = [
  // Juridique & finance
  "avocat", "notaire", "comptable", "fiduciaire", "huissier de justice",
  "courtier en assurance", "conseiller financier", "expert-comptable",
  // Santé
  "dentiste", "kinésithérapeute", "ostéopathe", "vétérinaire",
  "médecin généraliste", "pédiatre", "gynécologue", "dermatologue",
  "ophtalmologue", "orthodontiste", "psychologue", "nutritionniste",
  "podologue", "ergothérapeute", "infirmier",
  // Immobilier & construction
  "agence immobilière", "architecte", "géomètre", "promoteur immobilier",
  "menuisier", "électricien", "plombier", "chauffagiste", "peintre en bâtiment",
  "maçon", "couvreur", "serrurier", "carreleur", "isolation",
  // Dépannage d'urgence (offre Google Ads, priorité depuis 2026-09-02)
  "débouchage", "vitrier", "dégâts des eaux", "humidité", "nuisibles",
  // Beauté & bien-être
  "salon de coiffure", "institut de beauté", "barbier", "spa",
  "coach sportif", "salle de sport", "yoga", "pilates",
  // Alimentation & événements
  "traiteur", "boulangerie", "pâtisserie", "restaurant",
  "photographe", "vidéaste", "wedding planner",
  // Services aux entreprises
  "agence de communication", "imprimerie", "traducteur",
  "coach", "formateur", "consultant",
  // Auto & transport
  "garage automobile", "carrosserie", "taxi", "déménageur",
]

export const CATEGORIES: Record<string, string[]> = {
  "Juridique & Finance": ["avocat", "notaire", "comptable", "fiduciaire", "huissier de justice", "courtier en assurance", "conseiller financier", "expert-comptable"],
  "Santé": ["dentiste", "kinésithérapeute", "ostéopathe", "vétérinaire", "médecin généraliste", "pédiatre", "gynécologue", "dermatologue", "ophtalmologue", "orthodontiste", "psychologue", "nutritionniste", "podologue", "ergothérapeute", "infirmier"],
  "Immobilier & Construction": ["agence immobilière", "architecte", "géomètre", "promoteur immobilier", "menuisier", "électricien", "plombier", "chauffagiste", "peintre en bâtiment", "maçon", "couvreur", "serrurier", "carreleur", "isolation"],
  "Dépannage d'urgence": ["débouchage", "vitrier", "dégâts des eaux", "humidité", "nuisibles"],
  "Beauté & Bien-être": ["salon de coiffure", "institut de beauté", "barbier", "spa", "coach sportif", "salle de sport", "yoga", "pilates"],
  "Alimentation & Événements": ["traiteur", "boulangerie", "pâtisserie", "restaurant", "photographe", "vidéaste", "wedding planner"],
  "Services & Entreprises": ["agence de communication", "imprimerie", "traducteur", "coach", "formateur", "consultant"],
  "Auto & Transport": ["garage automobile", "carrosserie", "taxi", "déménageur"],
}

export async function GET() {
  return NextResponse.json({ secteurs: SECTEURS_LIST, categories: CATEGORIES, communes: COMMUNES })
}
