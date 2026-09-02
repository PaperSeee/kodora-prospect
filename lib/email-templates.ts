import type { DiagnosticFlag } from "./diagnose"

// ── Offre principale : Google Ads (growth operator) ──────────────
// Séquence de 4 messages espacés (J0, J+3, J+7, J+12), chacun autonome —
// aucun ne dit "je me permets de revenir vers vous". Le site vitrine reste
// une offre secondaire (voir noSiteEmailTemplate / staticEmailTemplate plus
// bas), proposée à qui n'a même pas de page où envoyer du trafic payant.

export const CONTACT_PHONE = "0489 57 65 65"
export const CONTACT_WHATSAPP_INTL = "32489576565" // format international, sans + ni 0

function waLink(text: string): string {
  return `https://wa.me/${CONTACT_WHATSAPP_INTL}?text=${encodeURIComponent(text)}`
}

export interface CompetitorInfo {
  motCle: string
  commune: string
  concurrent1?: string | null
  concurrent2?: string | null
}

// ── Email 1 — l'observation (J0, aucun lien) ──────────────────────
// Le premier message doit atterrir en boîte principale : texte brut, sans
// lien cliquable (le numéro reste en clair — cliquable automatiquement sur
// mobile, mais ce n'est pas un lien qu'on insère nous-mêmes).

export function adsEmail1Observation(nom: string, secteur: string, info: CompetitorInfo): { objet: string; corps: string } {
  const { motCle, commune, concurrent1, concurrent2 } = info
  const objet = `annonces Google à ${commune}`.slice(0, 60)

  const ouverture = concurrent1 && concurrent2
    ? `Sur « ${motCle} ${commune} », deux entreprises paient pour s'afficher au-dessus des résultats naturels : ${concurrent1} et ${concurrent2}. Vous, vous êtes en dessous.`
    : `J'ai regardé les annonces Google sur « ${motCle} ${commune} » cette semaine. Vous n'y apparaissez pas — au moins un de vos concurrents, si.`

  const corps = `Bonjour,

${ouverture}

Sur ces recherches-là, la personne appelle dans les cinq minutes. Elle ne compare pas trois devis — elle prend le premier numéro qu'elle voit.

Je gère ce type de campagnes pour des ${secteur} en Belgique.

Vous avez déjà essayé Google Ads, ou jamais ?

Ilias — Kodora
${CONTACT_PHONE} — appel ou WhatsApp`

  return { objet, corps }
}

// ── Email 2 — l'offre concrète (J+3) ──────────────────────────────
// Pas de chiffre de campagne cité comme preuve : on n'en a pas de vérifiés
// pour ce secteur/cette zone. L'offre est l'estimation elle-même, gratuite
// et sans engagement — l'information nouvelle du message, pas un rappel.

export function adsEmail2Offre(commune: string): { objet: string; corps: string } {
  const objet = `Re : annonces Google à ${commune}`.slice(0, 60)
  const corps = `Bonjour,

Une proposition concrète, plutôt qu'un rappel.

Je peux regarder ce que donnerait une campagne chez vous : volume de recherches sur ${commune}, prix du clic, budget nécessaire pour être visible sur vos mots-clés. Ça me prend vingt minutes et ça ne vous engage à rien.

Je vous l'envoie ?

Ilias
${CONTACT_PHONE}
WhatsApp direct : ${waLink("Bonjour Ilias, je voudrais l'estimation Google Ads pour ma zone")}`

  return { objet, corps }
}

// ── Email 3 — l'objection traitée (J+7) ───────────────────────────
// Le message qui ne vend rien : il désamorce la méfiance la plus courante
// contre Google Ads (campagne mal ciblée = budget brûlé pour rien).

export function adsEmail3Objection(commune: string): { objet: string; corps: string } {
  const objet = "la raison n°1 pour laquelle on me dit non"
  const corps = `Bonjour,

La plupart des patrons à qui j'écris me répondent la même chose : « j'ai déjà essayé Google, j'ai dépensé pour rien ».

C'est presque toujours le même problème — la campagne tournait sur des mots-clés trop larges. Quelqu'un qui tape « prix ${"{{métier}}"} » compare et ne rappelle jamais. Quelqu'un qui tape « ${"{{métier}}"} urgence ${commune} » appelle dans la minute.

On ne paie que pour le second. C'est tout le travail de ciblage.

Si vous vous êtes déjà fait avoir une fois, c'est justement le bon moment d'en reparler.

Ilias
${CONTACT_PHONE} · ${waLink("Bonjour Ilias")}`

  return { objet, corps }
}

// ── Email 4 — la sortie propre (J+12) ─────────────────────────────
// Dernier message de la séquence : pas de fausse urgence, pas de "dernière
// chance". Le "plus tard" crée un segment réutilisable plutôt qu'un contact
// brûlé — toute réponse, même négative, arrête la séquence immédiatement.

export function adsEmail4Sortie(): { objet: string; corps: string } {
  const objet = "je clôture"
  const corps = `Bonjour,

Dernier message de ma part, je ne veux pas encombrer votre boîte.

Si le sujet revient un jour — une saison creuse, un concurrent qui vous passe devant — gardez le numéro : ${CONTACT_PHONE}, appel ou WhatsApp.

Et si c'est simplement le mauvais moment, répondez « plus tard » : je reviens dans quelques mois, sans insister.

Bonne continuation,
Ilias`

  return { objet, corps }
}

// ── Néerlandais — traduction idiomatique, pas mot à mot ───────────

export function adsEmail1ObservationNL(secteur: string, info: CompetitorInfo): { objet: string; corps: string } {
  const { motCle, commune, concurrent1, concurrent2 } = info
  const objet = `Google-advertenties in ${commune}`.slice(0, 60)

  const opening = concurrent1 && concurrent2
    ? `Op « ${motCle} ${commune} » betalen twee bedrijven om boven de gewone resultaten te staan: ${concurrent1} en ${concurrent2}. U staat eronder.`
    : `Ik heb deze week de Google-advertenties bekeken op « ${motCle} ${commune} ». U staat er niet tussen — minstens één concurrent wel.`

  const corps = `Beste,

${opening}

Bij zo'n zoekopdracht belt de klant binnen de vijf minuten. Hij vergelijkt niet — hij neemt het eerste nummer dat hij ziet.

Ik beheer dit type campagnes voor ${secteur} in België.

Heeft u al eens met Google-advertenties gewerkt, of nog nooit?

Ilias — Kodora
${CONTACT_PHONE} — bellen of WhatsApp`

  return { objet, corps }
}

export function adsEmail2OffreNL(commune: string): { objet: string; corps: string } {
  const objet = `Re: Google-advertenties in ${commune}`.slice(0, 60)
  const corps = `Beste,

Een concreet voorstel, geen herinnering.

Ik kan bekijken wat een campagne bij u zou opleveren: zoekvolume in ${commune}, prijs per klik, nodig budget om zichtbaar te zijn op uw zoekwoorden. Kost mij twintig minuten en verbindt u tot niets.

Zal ik het doorsturen?

Ilias
${CONTACT_PHONE}
WhatsApp: ${waLink("Dag Ilias, ik wil graag de raming voor mijn zone")}`

  return { objet, corps }
}

export function adsEmail3ObjectionNL(commune: string): { objet: string; corps: string } {
  const objet = "waarom men mij meestal nee zegt"
  const corps = `Beste,

De meeste zaakvoerders antwoorden mij hetzelfde: « ik heb Google al geprobeerd, geld weggegooid ».

Bijna altijd dezelfde oorzaak — de campagne draaide op te brede zoekwoorden. Wie « prijs ${"{{beroep}}"} » typt, vergelijkt en belt nooit terug. Wie « ${"{{beroep}}"} dringend ${commune} » typt, belt binnen de minuut.

We betalen enkel voor het tweede. Dat is het hele werk.

Bent u al eens teleurgesteld geweest? Dan is dit net het juiste moment.

Ilias
${CONTACT_PHONE} · ${waLink("Dag Ilias")}`

  return { objet, corps }
}

export function adsEmail4SortieNL(): { objet: string; corps: string } {
  const objet = "ik sluit af"
  const corps = `Beste,

Laatste bericht, ik wil uw mailbox niet belasten.

Komt het onderwerp ooit terug — een stil seizoen, een concurrent die u voorbijsteekt — hou dan het nummer bij: ${CONTACT_PHONE}, bellen of WhatsApp.

En als het gewoon slecht uitkomt, antwoord « later »: ik kom over enkele maanden terug, zonder aan te dringen.

Veel succes,
Ilias`

  return { objet, corps }
}

// ── Offre secondaire : site vitrine (aucune page où envoyer du trafic) ──
// Un prospect sans site n'est pas un bon prospect Ads — il n'a nulle part où
// envoyer le clic payant. On lui propose d'abord le site ; l'offre Ads vient
// naturellement après, une fois qu'il en a un.

const PLATEFORMES_LABELS = ["doctoranytime", "zocdoc", "practo", "facebook.com", "instagram.com", "linkedin.com"]

export function isPlateformUrl(url?: string | null): boolean {
  if (!url) return false
  return PLATEFORMES_LABELS.some(p => url.toLowerCase().includes(p))
}

const OBJETS_NO_SITE = [
  (nom: string) => `Question rapide — ${nom}`,
  (nom: string) => `${nom}, je n'ai pas trouvé votre site`,
  (_nom: string) => `Une question rapide`,
]

export function noSiteEmailTemplate(
  nom: string,
  secteur: string,
  ville: string,
  avis?: number | null,
): { objet: string; corps: string } {
  const idx = nom.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % OBJETS_NO_SITE.length
  const objet = OBJETS_NO_SITE[idx](nom).slice(0, 50)
  const avisText = avis && avis > 0 ? ` — vous avez ${avis} avis Google` : ""

  const corps = `Bonjour,

Je cherchais des ${secteur} à ${ville} et je n'ai pas trouvé de site web pour ${nom}${avisText}.

Sans page où envoyer les gens, impossible de faire de la publicité ciblée efficacement — et beaucoup de clients cherchent en ligne avant d'appeler.

Je crée des sites vitrines pour des ${secteur} en 7 jours, à partir de 299 €. Une fois en ligne, on peut aussi parler de vous rendre visible sur Google au bon moment.

Si ça vous intéresse, répondez simplement à ce mail.

Bonne journée,
Ilias — Kodora
kodora.eu · ${CONTACT_PHONE}

P.S. — Si ce mail ne vous intéresse pas, ignorez-le simplement.`

  return { objet, corps }
}

// Objets variés pour éviter la répétition qui déclenche les filtres spam
const OBJETS_SITE_ABSENT = ["Une question rapide", "J'ai cherché votre site", "Petite question", "Je n'ai pas trouvé votre site"]
const OBJETS_SITE_HS = ["Votre site semble avoir un problème", "J'ai essayé de visiter votre site", "Petit souci sur votre site", "Votre site ne répond plus"]
const OBJETS_MOBILE = ["Un détail sur votre site", "J'ai regardé votre site sur mobile", "Petite observation", "Votre site et les smartphones"]
const OBJETS_DATE = ["Une observation sur votre site", "J'ai regardé votre site", "Votre site mérite une mise à jour", "Petit retour sur votre présence web"]
const OBJETS_LENT = ["Votre site charge lentement", "J'ai testé votre site", "Un point technique sur votre site", "Performance de votre site"]

function pick(arr: string[], nom: string): string {
  // Déterministe selon le nom pour éviter l'aléatoire pur (reproductible)
  const idx = nom.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % arr.length
  return arr[idx]
}

export function staticEmailTemplate(
  nom: string,
  secteur: string,
  flags: DiagnosticFlag[],
  avis?: number | null,
  ville?: string | null
): { objet: string; corps: string } | null {
  const has = (f: string) => flags.some((fl) => fl === f || fl.startsWith(f))
  const avisText = avis && avis > 0 ? ` (vous avez ${avis} avis Google)` : ""
  const villeLabel = ville && ville.trim() ? ville.trim() : "votre région"

  let objet = ""
  let corps = ""

  if (has("AUCUN_SITE")) {
    objet = pick(OBJETS_SITE_ABSENT, nom)
    corps = `Bonjour,

Je cherchais des ${secteur} à ${villeLabel} et je n'ai pas trouvé de site pour votre cabinet${avisText}.

Beaucoup de clients potentiels cherchent en ligne avant d'appeler — sans site, ces demandes vont chez vos confrères.

Je m'appelle Ilias, je crée des sites vitrines pour des professionnels comme vous. Livraison en une semaine, à partir de 299 €.

Si ça vous intéresse, répondez simplement à ce mail — je vous montre des exemples concrets.

Ilias
Kodora — kodora.eu
${CONTACT_PHONE}

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("SITE_INACCESSIBLE") || has("SITE_HS_")) {
    objet = pick(OBJETS_SITE_HS, nom)
    corps = `Bonjour,

J'ai voulu visiter votre site web mais il semble inaccessible en ce moment${avisText}.

Ce genre de panne fait souvent perdre des contacts — les visiteurs partent sans rappeler.

Je m'appelle Ilias, je travaille avec des ${secteur} pour améliorer leur présence en ligne. Si vous souhaitez qu'on regarde ça ensemble, répondez à ce mail.

Ilias
Kodora — kodora.eu
${CONTACT_PHONE}

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("PAS_MOBILE")) {
    objet = pick(OBJETS_MOBILE, nom)
    corps = `Bonjour,

J'ai regardé votre site depuis mon téléphone et il s'affiche mal — texte trop petit, boutons difficiles à cliquer${avisText}.

Aujourd'hui plus de 70% des recherches locales se font sur mobile. Un site non adapté fait fuir ces visiteurs.

Je m'appelle Ilias, je crée des sites optimisés mobile pour des ${secteur}. Répondez à ce mail si vous voulez qu'on en parle.

Ilias
Kodora — kodora.eu
${CONTACT_PHONE}

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("SITE_DATE_")) {
    const year = flags.find(f => f.startsWith("SITE_DATE_"))?.replace("SITE_DATE_", "") ?? "plusieurs années"
    objet = pick(OBJETS_DATE, nom)
    corps = `Bonjour,

J'ai regardé votre site — il date de ${year}${avisText}. Les attentes des visiteurs ont beaucoup changé depuis, et Google pénalise les sites anciens dans ses résultats.

Je m'appelle Ilias, je refais des sites pour des ${secteur} qui veulent rester visibles en ligne. Livraison en une semaine.

Si ça vous intéresse, répondez simplement à ce mail.

Ilias
Kodora — kodora.eu
${CONTACT_PHONE}

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("SITE_LENT")) {
    objet = pick(OBJETS_LENT, nom)
    corps = `Bonjour,

J'ai testé votre site — il met plus de 4 secondes à charger${avisText}. Google considère qu'au-delà de 3 secondes, la moitié des visiteurs abandonnent.

Je m'appelle Ilias, je crée des sites rapides et optimisés pour des ${secteur}. Répondez à ce mail si vous voulez en savoir plus.

Ilias
Kodora — kodora.eu
${CONTACT_PHONE}

Pour ne plus recevoir mes messages, répondez STOP.`

  } else {
    // Fallback générique (PAS_HTTPS, flags inconnus, ou aucun flag)
    const objets = ["Une observation sur votre présence web", "J'ai regardé votre site", "Petite question sur votre site", "Un retour rapide sur votre site"]
    objet = pick(objets, nom)
    corps = `Bonjour,

J'ai regardé votre présence en ligne et j'ai noté quelques points qui pourraient freiner vos contacts depuis le web${avisText}.

Je m'appelle Ilias, je travaille avec des ${secteur} pour améliorer leur visibilité en ligne. Si vous voulez qu'on en parle rapidement, répondez simplement à ce mail.

Ilias
Kodora — kodora.eu
${CONTACT_PHONE}

Pour ne plus recevoir mes messages, répondez STOP.`
  }

  return { objet, corps }
}
