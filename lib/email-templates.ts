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
//
// Ton volontairement moins "copywriter" : phrases courtes, parfois
// incomplètes, comme un vrai email tapé vite entre deux trucs — pas une
// suite de formules bien tournées. Chaque message dit clairement ce que ça
// change concrètement (le téléphone qui sonne), pas juste "être visible".

export function adsEmail1Observation(nom: string, secteur: string, info: CompetitorInfo): { objet: string; corps: string } {
  const { motCle, commune, concurrent1, concurrent2 } = info
  const objet = `question rapide sur ${commune}`.slice(0, 60)

  const ouverture = concurrent1 && concurrent2
    ? `Petite observation : j'ai regardé qui paie pour apparaître sur « ${motCle} ${commune} ». Il y a ${concurrent1} et ${concurrent2}. Vous, non.`
    : `Petite observation : j'ai regardé les annonces sur « ${motCle} ${commune} » cette semaine. Au moins un concurrent y est, pas vous.`

  const corps = `Bonjour,

${ouverture}

Concrètement, ça veut dire que pour un client qui cherche un ${secteur} maintenant, tout de suite, c'est eux qui décrochent le téléphone en premier. Pas vous.

Je m'occupe de ce genre de campagnes pour des ${secteur} en Belgique — et le principe est simple : quand quelqu'un a un besoin urgent, il ne compare pas trois devis, il appelle le premier numéro qu'il voit.

Vous avez déjà testé Google Ads, ou pas encore ?

Ilias — Kodora
${CONTACT_PHONE}, appel ou WhatsApp`

  return { objet, corps }
}

// ── Email 2 — l'offre concrète (J+3) ──────────────────────────────
// Pas de chiffre de campagne cité comme preuve : on n'en a pas de vérifiés
// pour ce secteur/cette zone. L'offre est l'estimation elle-même, gratuite
// et sans engagement — l'information nouvelle du message, pas un rappel.

export function adsEmail2Offre(commune: string): { objet: string; corps: string } {
  const objet = `pour ${commune}`.slice(0, 60)
  const corps = `Bonjour,

Je reprends là où j'en étais : je peux regarder concrètement ce que ça donnerait chez vous — combien de personnes cherchent votre métier sur ${commune}, ce que ça coûterait par clic, le budget pour être devant.

Ça me prend une vingtaine de minutes de mon côté, et ça ne vous engage à rien du tout — vous voyez juste les chiffres et vous décidez après.

Je m'y mets ?

Ilias
${CONTACT_PHONE}
Ou direct sur WhatsApp : ${waLink("Bonjour Ilias, je voudrais l'estimation Google Ads pour ma zone")}`

  return { objet, corps }
}

// ── Email 3 — l'objection traitée (J+7) ───────────────────────────
// Le message qui ne vend rien : il désamorce la méfiance la plus courante
// contre Google Ads (campagne mal ciblée = budget brûlé pour rien).

export function adsEmail3Objection(commune: string): { objet: string; corps: string } {
  const objet = "pourquoi on me dit souvent non"
  const corps = `Bonjour,

Ceux à qui j'écris me répondent souvent la même chose : "j'ai déjà essayé Google, j'ai payé pour rien".

En général c'est un problème de ciblage, pas de Google Ads en soi. Une campagne mal réglée tourne sur des mots trop larges — quelqu'un qui tape juste "prix ${"{{métier}}"}" compare dix devis et ne rappelle personne. Quelqu'un qui tape "${"{{métier}}"} urgence ${commune}" a déjà décidé, il veut juste un numéro.

C'est cette deuxième personne qu'on cible. Le reste, on ne le paie pas.

Si ça vous est déjà arrivé, c'est justement le bon moment d'en reparler — deux minutes suffisent pour voir si ça change quelque chose chez vous.

Ilias
${CONTACT_PHONE} · ${waLink("Bonjour Ilias")}`

  return { objet, corps }
}

// ── Email 4 — la sortie propre (J+12) ─────────────────────────────
// Dernier message de la séquence : pas de fausse urgence, pas de "dernière
// chance". Le "plus tard" crée un segment réutilisable plutôt qu'un contact
// brûlé — toute réponse, même négative, arrête la séquence immédiatement.

export function adsEmail4Sortie(): { objet: string; corps: string } {
  const objet = "dernier mot de ma part"
  const corps = `Bonjour,

Je n'insiste pas plus, je sais que la boîte mail déborde vite.

Gardez juste le numéro quelque part — ${CONTACT_PHONE} — si un jour c'est calme, ou qu'un concurrent commence à vous prendre du terrain.

Et si c'est juste pas le bon moment là maintenant, répondez "plus tard", je reviendrai sans forcer dans quelques mois.

Bonne continuation,
Ilias`

  return { objet, corps }
}

// ── Néerlandais — traduction idiomatique, pas mot à mot ───────────

export function adsEmail1ObservationNL(secteur: string, info: CompetitorInfo): { objet: string; corps: string } {
  const { motCle, commune, concurrent1, concurrent2 } = info
  const objet = `korte vraag over ${commune}`.slice(0, 60)

  const opening = concurrent1 && concurrent2
    ? `Kleine observatie: ik heb gekeken wie betaalt om boven te staan op « ${motCle} ${commune} ». ${concurrent1} en ${concurrent2} staan er. U niet.`
    : `Kleine observatie: ik heb deze week de advertenties bekeken op « ${motCle} ${commune} ». Minstens één concurrent staat erbij, u niet.`

  const corps = `Beste,

${opening}

Concreet betekent dat: iemand die nu, dringend, een ${secteur} zoekt, belt eerst hén. Niet u.

Ik beheer dit soort campagnes voor ${secteur} in België — het principe is simpel: bij een dringende zoekopdracht vergelijkt niemand drie offertes, men belt het eerste nummer dat men ziet.

Heeft u Google Ads al eens geprobeerd, of nog niet?

Ilias — Kodora
${CONTACT_PHONE}, bellen of WhatsApp`

  return { objet, corps }
}

export function adsEmail2OffreNL(commune: string): { objet: string; corps: string } {
  const objet = `voor ${commune}`.slice(0, 60)
  const corps = `Beste,

Ik pik terug op waar ik gebleven was: ik kan concreet bekijken wat het bij u zou opleveren — hoeveel mensen zoeken uw beroep in ${commune}, wat een klik kost, welk budget nodig is om bovenaan te staan.

Kost mij een twintigtal minuten, en verbindt u tot niets — u ziet gewoon de cijfers en beslist daarna.

Zal ik ermee starten?

Ilias
${CONTACT_PHONE}
Of rechtstreeks via WhatsApp: ${waLink("Dag Ilias, ik wil graag de raming voor mijn zone")}`

  return { objet, corps }
}

export function adsEmail3ObjectionNL(commune: string): { objet: string; corps: string } {
  const objet = "waarom men mij vaak nee zegt"
  const corps = `Beste,

Wie mij antwoordt, zegt vaak hetzelfde: "ik heb Google al geprobeerd, geld weggegooid".

Meestal is het een targetingprobleem, geen probleem met Google Ads zelf. Een slecht ingestelde campagne draait op te brede zoekwoorden — wie gewoon "prijs ${"{{beroep}}"}" typt vergelijkt tien offertes en belt niemand terug. Wie "${"{{beroep}}"} dringend ${commune}" typt, heeft al beslist, die wil gewoon een nummer.

Op die tweede persoon mikken we. De rest betalen we niet.

Als u dit al is overkomen, is dit net het juiste moment om erover te praten — twee minuten volstaan om te zien of het bij u iets verandert.

Ilias
${CONTACT_PHONE} · ${waLink("Dag Ilias")}`

  return { objet, corps }
}

export function adsEmail4SortieNL(): { objet: string; corps: string } {
  const objet = "laatste woord van mij"
  const corps = `Beste,

Ik dring niet verder aan, ik weet dat de mailbox snel volloopt.

Hou het nummer ergens bij — ${CONTACT_PHONE} — mocht het ooit rustiger worden, of een concurrent terrein winnen.

En als het nu gewoon niet het juiste moment is, antwoord "later", dan kom ik binnen enkele maanden rustig terug.

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
