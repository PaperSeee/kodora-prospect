// ── Configuration du pipeline auto de prospection ──
//
// Garde-fous délibérés pour protéger la délivrabilité et le domaine.
// 100 cold emails/jour dès un domaine neuf = spam + blacklist garantis.
// On démarre bas et on monte progressivement (warm-up).

// Secteurs sourcés en rotation (un sous-ensemble différent chaque jour
// évite de re-scraper toujours les mêmes et épuiser un secteur).
//
// ⚠️ RETARGETÉ le 2026-09-02 pour le pivot Google Ads (growth operator).
// Aucune donnée de conversion fiable avant les campagnes de septembre 2026 —
// les anciens taux mesuraient l'offre site vitrine (retirés des commentaires
// le 2026-09-02 : c'étaient des statuts que le correctif KPI a démontrés
// fabriqués — vues de page comptées comme leads, clics de robots comme RDV).
// Le critère de ciblage n'est plus un taux mesuré mais le principe de
// l'offre : un bon prospect Ads est "chez lui, la recherche est urgente et
// la personne appelle le premier numéro qu'elle voit" — l'argument central
// de la séquence email (voir lib/email-templates.ts). Ça exclut par
// construction les professions de bureau (comptable, avocat, notaire) où
// personne ne cherche "avocat urgence" un dimanche soir.
//
// Repose sur lib/source-overpass.ts::SECTEUR_OSM pour le sourcing gratuit
// (fallback sans clé Google Places) — débouchage, serrurier, vitrier,
// dégâts des eaux, humidité, nuisibles y sont mappés depuis ce même commit.
export const SECTEURS_ROTATION: string[][] = [
  ["débouchage", "serrurier", "vitrier"],
  ["électricien", "chauffagiste", "plombier"],
  ["dégâts des eaux", "nuisibles", "humidité"],
  ["débouchage", "vitrier", "chauffagiste"],
  ["serrurier", "électricien", "plombier"],
  ["débouchage", "nuisibles", "dégâts des eaux"],
]

// Métadonnées grammaticales par secteur, utilisées dans les templates email
// plutôt qu'une interpolation brute de `secteur` — "des ${secteur}" produit
// "des serrurier" (singulier, pas d'article correct) pour tout secteur qui
// n'est pas déjà un nom pluriel en français. secteurLabel/secteurLabelNl
// portent la formulation complète et grammaticalement correcte ; motCle est
// le terme réellement tapé dans une recherche Google ("débouchage", pas
// "des entreprises de débouchage").
export interface SecteurMeta {
  secteurLabel: string
  secteurLabelNl: string
  motCle: string
}

export const SECTEURS_META: Record<string, SecteurMeta> = {
  "débouchage": { secteurLabel: "des entreprises de débouchage", secteurLabelNl: "ontstoppingsbedrijven", motCle: "débouchage" },
  "serrurier": { secteurLabel: "des serruriers", secteurLabelNl: "slotenmakers", motCle: "serrurier urgence" },
  "vitrier": { secteurLabel: "des vitriers", secteurLabelNl: "glaszetters", motCle: "vitrier urgence" },
  "électricien": { secteurLabel: "des électriciens de dépannage", secteurLabelNl: "depannage-elektriciens", motCle: "électricien urgence" },
  "chauffagiste": { secteurLabel: "des chauffagistes", secteurLabelNl: "verwarmingstechnici", motCle: "chauffagiste urgence" },
  "plombier": { secteurLabel: "des plombiers", secteurLabelNl: "loodgieters", motCle: "plombier urgence" },
  "dégâts des eaux": { secteurLabel: "des entreprises de dégâts des eaux", secteurLabelNl: "waterschadebedrijven", motCle: "dégâts des eaux" },
  "humidité": { secteurLabel: "des entreprises de traitement de l'humidité", secteurLabelNl: "vochtbestrijdingsbedrijven", motCle: "traitement humidité" },
  "nuisibles": { secteurLabel: "des entreprises de dératisation", secteurLabelNl: "ongediertebestrijders", motCle: "dératisation" },
}

// Renvoie les métadonnées d'un secteur, ou un repli grammaticalement sûr
// (jamais "des {secteur}" brut) si le secteur n'est pas dans la table —
// garde-fou pour un secteur ajouté à SECTEURS_ROTATION sans être ajouté ici.
export function secteurMeta(secteur: string): SecteurMeta {
  const meta = SECTEURS_META[secteur.toLowerCase().trim()]
  if (meta) return meta
  return { secteurLabel: `des professionnels du secteur ${secteur}`, secteurLabelNl: `${secteur}-bedrijven`, motCle: secteur }
}

// Valide que chaque secteur actif (présent dans la rotation auto) a bien
// ses métadonnées — évite le repli générique en silence pour un secteur
// qu'on sait pourtant utiliser en prod. Appelé au build (voir script "build"
// dans package.json) : un secteur manquant fait échouer le build plutôt que
// de laisser un "des professionnels du secteur X" partir à de vrais prospects.
export function validateSecteursMeta(): void {
  const manquants = new Set<string>()
  for (const secteur of SECTEURS_ROTATION.flat()) {
    if (!SECTEURS_META[secteur.toLowerCase().trim()]) manquants.add(secteur)
  }
  if (manquants.size > 0) {
    throw new Error(
      `SECTEURS_META incomplet : ${[...manquants].join(", ")} — ajoute secteurLabel/secteurLabelNl/motCle dans lib/pipeline-config.ts avant de sourcer ce secteur.`
    )
  }
}

// Séquence de suivi réactivée le 2026-09-02, sur un nouveau principe :
// chaque message apporte une information neuve et autonome (value ladder),
// aucun ne dit "je me permets de revenir vers vous". 4 messages, espacés
// J0 → J+3 → J+7 → J+12. Toute réponse arrête la séquence immédiatement
// (voir pipeline/run/route.ts, qui ne retouche jamais un prospect a_repondu).
export const RELANCES_ACTIVES = true
export const SEQUENCE_DELAIS_JOURS = [3, 7, 12] // délai depuis le PRÉCÉDENT message de la séquence
export const RELANCES_SEULEMENT_APRES = new Date("2026-09-02")

// Secteurs dont la conversion mesurée est forte : bonus de score au sourcing
// pour qu'ils passent en tête de la file d'envoi (le pipeline envoie par
// score décroissant).
//
// Aucune donnée de conversion fiable avant les campagnes de septembre 2026.
// Vidé le 2026-09-02 plutôt que rerempli avec une hiérarchie inventée : le
// bonus reste neutre (aucun secteur favorisé) tant qu'un vrai backup n'a pas
// tourné sur la rotation actuelle. Rebrancher une fois 2-3 semaines de
// données réelles disponibles.
export const SECTEURS_PRIORITAIRES = new Set<string>([])

// Communes ciblées, par ordre de priorité. On commence par Bruxelles (plus gros
// marché) ; quand un secteur y est épuisé, le pipeline passe automatiquement à
// la commune suivante (Ixelles, Schaerbeek, Forest…) pour trouver du nouveau.
export const COMMUNES = [
  "Bruxelles",
  "Ixelles",
  "Schaerbeek",
  "Anderlecht",
  "Molenbeek-Saint-Jean",
  "Saint-Gilles",
  "Uccle",
  "Forest",
  "Etterbeek",
  "Woluwe-Saint-Lambert",
  "Woluwe-Saint-Pierre",
  "Jette",
  "Auderghem",
  "Watermael-Boitsfort",
  "Saint-Josse-ten-Noode",
  "Koekelberg",
  "Berchem-Sainte-Agathe",
  "Ganshoren",
  "Evere",
  // Wallonie — ajoutée le 2026-09-02. L'offre Ads cible déjà "Bruxelles +
  // Wallonie" (voir config/case-study.json), mais le sourcing ne couvrait
  // que Bruxelles-Capitale jusqu'ici. Grandes villes wallonnes, choisies
  // pour leur nom non ambigu au géocodage Nominatim (countrycodes=be déjà
  // filtré dans lib/source-overpass.ts) — pas les 262 communes wallonnes,
  // qui multiplieraient le temps de sourcing pour un gain marginal.
  "Charleroi",
  "Liège",
  "Namur",
  "Mons",
  "Tournai",
  "La Louvière",
  "Verviers",
  "Mouscron",
  "Wavre",
  "Nivelles",
  // Deuxième vague wallonne — ajoutée le 2026-09-08, même critère que la
  // première (noms non ambigus au géocodage Nominatim, countrycodes=be déjà
  // filtré dans lib/source-overpass.ts). Villes moyennes à forte densité
  // d'artisans/commerces plutôt que les 262 communes wallonnes en entier.
  "Seraing",
  "Herstal",
  "Braine-l'Alleud",
  "Ottignies-Louvain-la-Neuve",
  "Arlon",
  "Huy",
  "Dinant",
  "Marche-en-Famenne",
  "Gembloux",
  "Waterloo",
  "Genappe",
  "Tubize",
  "Soignies",
  "Ath",
  "Comines-Warneton",
]

// Nb de prospects sourcés par secteur à chaque run.
export const MAX_PAR_SECTEUR = 10

// Objectif de NOUVEAUX prospects à sourcer par run : on vise à reconstituer le
// stock pour couvrir le plafond d'envoi du jour (+ une petite marge). Calculé
// dynamiquement depuis le cap du ramp — voir objectifSourcing().
export function objectifSourcing(capDuJour: number): number {
  return capDuJour + 10 // marge pour absorber doublons / prospects sans email
}

// Nb max de tentatives (secteur × commune) en un run, garde-fou si tout est
// quasi vide. Généreux car on vise jusqu'à ~50 prospects sur plusieurs communes.
// Borné de toute façon par le budget temps (60s Hobby).
export const MAX_TENTATIVES_PAR_RUN = 30

// Timeout de diagnostic par site pendant le pipeline auto (court, pour tenir
// dans les 60s). La route SSE manuelle garde le défaut plus généreux (10s).
export const DIAG_TIMEOUT_PIPELINE_MS = 4000

// ── RAMP D'ENVOI ──
// Plafond d'emails envoyés par jour, qui augmente AUTOMATIQUEMENT avec l'âge du
// programme (warm-up). Objectif final : 50/jour.
// jour 1-7 : 20  /  semaine 2 : 30  /  semaine 3 : 40  /  ensuite : 50 (max)
const RAMP: { afterDays: number; cap: number }[] = [
  { afterDays: 0, cap: 20 },
  { afterDays: 7, cap: 30 },
  { afterDays: 14, cap: 40 },
  { afterDays: 21, cap: 50 },
]

// Plafond du jour, calculé d'après le nombre de jours depuis le 1er run.
export function dailyCap(daysSinceStart: number): number {
  let cap = RAMP[0].cap
  for (const step of RAMP) {
    if (daysSinceStart >= step.afterDays) cap = step.cap
  }
  return cap
}

// Délai aléatoire (ms) entre deux envois — petit jitter pour éviter les bursts
// parfaitement réguliers, mais court pour tenir dans les 45s de budget Hobby :
// ~0,3-0,7s/email → permet ~50 envois par run. Brevo gère ce rythme sans souci.
export function jitterDelay(): number {
  // entre 0,3s et 0,7s
  return 300 + Math.floor(Math.random() * 400)
}

// Budget temps (ms) max d'un run, pour rester sous la limite Vercel Hobby (60s).
// 52s laisse de la marge ; avec ~0,3-0,7s/email ça couvre largement 50 envois.
// On arrête proprement l'envoi avant le timeout — le reste partira au prochain run.
export const RUN_TIME_BUDGET_MS = 52_000

// ── CANAL DE SORTIE ──
//
// L'email cold obtient zéro réponse mesurée — canal remplacé par le tableau
// WhatsApp (/whatsapp, voir components/WhatsappBoard.tsx). Coupé ici plutôt
// que supprimé : toute la mécanique (templates, séquence, cron, webhook
// Brevo) reste en place au cas où on voudrait la rallumer. app/api/pipeline/
// run/route.ts (le cron d'envoi quotidien) lit ce flag et sort tôt si false.
export const SEND_EMAIL_ENABLED = false

// Template WhatsApp, substitution de {metier} et {commune}. Un premier
// message WhatsApp qui convertit ressemble à ce qu'un humain tape vraiment :
// court (une respiration, pas un pavé), le "pourquoi je t'écris" tient en une
// phrase, zéro jargon commercial ("solution", "opportunité", "je me
// permets"), et une seule question fermée/facile à la fin — WhatsApp est un
// canal de réponse rapide, pas un canal de lecture. Signé "Ilias" (pas
// "Kodora, growth operator") : sur ce canal, un nom de personne répond mieux
// qu'un nom d'entreprise.
export const WHATSAPP_MESSAGE_TEMPLATE =
  "Bonjour, Ilias ici 👋 Je reçois régulièrement des demandes de {metier} à " +
  "{commune} via un site que je gère, et je les redirige vers un artisan du coin. " +
  "Ça vous intéresse que je vous envoie les prochaines ?"

export function whatsappMessage(secteur: string, commune: string): string {
  const metier = secteurMeta(secteur).motCle
  return WHATSAPP_MESSAGE_TEMPLATE.replace("{metier}", metier).replace("{commune}", commune)
}

// Ne re-propose pas par défaut un prospect déjà contacté via WhatsApp il y a
// moins de 90 jours (voir WhatsappContact dans schema.prisma) — évite de
// spammer deux fois la même entreprise en dessous d'un délai raisonnable de
// relance.
export const CONTACT_COOLDOWN_JOURS = 90
