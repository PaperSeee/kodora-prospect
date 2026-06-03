export interface Prospect {
  id: number
  nom: string
  secteur: string
  ville: string
  telephone: string | null
  email: string | null
  siteWeb: string | null
  note: number | null
  avis: number | null
  statut: string
  score: number
  angle: string | null
  goldStar: boolean
  diagnostic: string | null
  emailObjet: string | null
  emailCorps: string | null
  emailHtml: string | null
  notes: string | null
  emailOuvert: boolean
  emailOuvertAt: Date | null
  relancee: boolean
  relanceeAt: Date | null
  createdAt: Date
  updatedAt: Date
}
