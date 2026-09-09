import { toLocalDigits } from "./phone"

// Recherche et nettoyage d'affichage pour le tableau WhatsApp
// (components/WhatsappBoard.tsx).
//
// Cas d'usage principal : un prospect rappelle, son numéro s'affiche sur le
// téléphone, il faut le retrouver en quelques frappes. La recherche par
// chiffres compte donc autant que la recherche par nom, et doit ignorer le
// formatage stocké en base ("04 93 46 24 76", "+32 493 46 24 76"...).

// Minuscules sans accents, pour que "molenbeek" trouve "Molenbeek" et
// "electricien" trouve "Électricien".
export function normalizeText(v: string): string {
  return v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "")
}

// Les noms viennent de Google Places et les angles de lib/score.ts : les uns
// comme les autres contiennent des emojis ("EC HABITAT 🏠 TOITURE ✅").
// On les retire à l'affichage plutôt que par une migration, pour que les
// 2 500 lignes déjà en base soient propres immédiatement.
export function stripEmoji(v: string): string {
  return v
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{20E3}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s—·-]+|[\s—·-]+$/g, "")
    .trim()
}

export interface Searchable {
  nom: string
  secteur: string
  ville: string
  telephone: string | null
  siteWeb: string | null
}

// true si la ligne correspond à la requête. Une requête d'au moins 3 chiffres
// est traitée comme un numéro de téléphone ; si elle ne contient QUE des
// chiffres on s'arrête là, sinon "2476" remonterait tous les noms contenant
// ces caractères.
export function matchesQuery(row: Searchable, query: string): boolean {
  const q = query.trim()
  if (!q) return true

  // Les deux côtés passent par la normalisation belge de lib/phone.ts, sinon
  // "+32 493 46 24 76" (tel qu'affiché par le téléphone à l'appel entrant) ne
  // retrouverait pas "0493 46 24 76" (tel que stocké depuis Google Places).
  const qDigits = onlyDigits(q)
  const qLocal = toLocalDigits(q)
  if (qLocal.length >= 3 && toLocalDigits(row.telephone).includes(qLocal)) {
    return true
  }

  const purementNumerique = qDigits.length > 0 && qDigits.length === q.replace(/[\s+.()-]/g, "").length
  if (purementNumerique) return false

  const qText = normalizeText(q)
  return [row.nom, row.secteur, row.ville, row.siteWeb ?? ""].some((champ) =>
    normalizeText(champ).includes(qText)
  )
}
