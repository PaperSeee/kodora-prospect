// Normalisation des numéros belges pour le tableau WhatsApp
// (components/WhatsappBoard.tsx) — telephone en base vient de Google Places
// Details (formatted_phone_number), donc déjà lisible ("04xx xx xx xx",
// "02 xxx xx xx", "+32 4xx xx xx xx"...) mais pas dans un format exploitable
// tel quel par wa.me ou tel:.

// Garde uniquement les chiffres, en retirant le préfixe international s'il
// est déjà présent (+32 ou 0032) pour repartir d'une base "0xxxxxxxx"
// uniforme avant de reconstruire le format international E.164.
function digitsOnly(raw: string): string {
  let d = raw.replace(/\D/g, "")
  if (d.startsWith("0032")) d = d.slice(2)
  else if (d.startsWith("32") && d.length > 9) d = "0" + d.slice(2)
  return d
}

// true si le numéro (une fois normalisé en "0xxxxxxxx") est un mobile belge
// — préfixe 04, seul cas qui a un compte WhatsApp associé. Tout le reste
// (02/03/04-fixe.../09, zones 010-087) est une ligne fixe → bouton "Appeler".
export function isMobileBe(raw: string | null | undefined): boolean {
  if (!raw) return false
  const d = digitsOnly(raw)
  return /^04\d{8}$/.test(d)
}

// "04xx xx xx xx" / "0032 4xx..." / "+32 4xx..." → "324xxxxxxxx", le format
// attendu par wa.me (indicatif pays + numéro sans le 0 initial, sans "+").
export function toWhatsappNumber(raw: string): string | null {
  const d = digitsOnly(raw)
  if (!/^0\d{8,9}$/.test(d)) return null
  return "32" + d.slice(1)
}

// Format tel: pour le bouton "Appeler" (lignes fixes) — E.164 avec "+",
// format que les apps téléphone (mobile/desktop) savent composer sans
// ambiguïté, contrairement à un numéro local qui dépend de l'indicatif
// déjà configuré sur l'appareil.
export function toTelHref(raw: string): string | null {
  const d = digitsOnly(raw)
  if (!/^0\d{7,9}$/.test(d)) return null
  return "+32" + d.slice(1)
}

export function whatsappUrl(raw: string, message: string): string | null {
  const number = toWhatsappNumber(raw)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
