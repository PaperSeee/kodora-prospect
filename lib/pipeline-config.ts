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
//
// "couvreur" ajouté le 2026-09-15 comme proxy de sourcing pour le site lead
// "gouttières" (nettoyage-gouttieres-bruxelles.be) — aucun tag OSM dédié aux
// entreprises de nettoyage de gouttières n'existe, voir le commentaire sur
// SECTEUR_OSM["couvreur"] dans source-overpass.ts.
export const SECTEURS_ROTATION: string[][] = [
  ["débouchage", "serrurier", "vitrier"],
  ["électricien", "chauffagiste", "plombier"],
  ["dégâts des eaux", "nuisibles", "humidité"],
  ["débouchage", "vitrier", "chauffagiste"],
  ["serrurier", "électricien", "plombier"],
  ["débouchage", "nuisibles", "dégâts des eaux"],
  ["vitrier", "nuisibles", "couvreur"],
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
  "couvreur": { secteurLabel: "des couvreurs", secteurLabelNl: "dakdekkers", motCle: "nettoyage gouttières" },
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
// score décroissant), et même bonus appliqué en lecture par l'API /whatsapp
// pour que les ~2500 prospects déjà en base en profitent aussi, sans
// réécrire leur score stocké (voir SECTEUR_PRIORITE_BONUS ci-dessous).
//
// Rebranché le 2026-09-15 sur des clics Search Console réels (cockpit SEO,
// fenêtre 28 j) plutôt qu'une hiérarchie mesurée par email (invalidée le
// 2026-09-02, compteurs fabriqués). Deux niveaux, pas une liste plate :
// vitrier (Allo Vitrier) et couvreur (proxy du site "gouttières",
// nettoyage-gouttieres-bruxelles.be) sont les sites que le propriétaire du
// produit identifie comme ceux qui fonctionnent bien — priorité forte.
// Électricien/serrurier/chauffagiste ont un peu de trafic réel mais
// nettement moins. Débouchage, plombier, humidité et dégâts des eaux
// restent neutres faute de site avec clics mesurés.
//
// "nuisibles" a été RETIRÉ de la priorité forte le 2026-09-15 (après y avoir
// été ajouté plus tôt le même jour) : constaté en prod (voir logs Sourcer)
// que le sourcing OSM renvoie 0 résultat sur toutes les communes essayées.
// Vérifié indépendamment via Overpass — seulement 3 nœuds craft/office=
// pest_control dans TOUTE la Belgique (0 sur Bruxelles). Les entreprises de
// dératisation n'ont quasiment pas pignon sur rue à cartographier, donc OSM
// ne les répertorie pas — contrairement à serrurier/vitrier/électricien qui
// s'y trouvent bien. Le fallback Google Places existant dans le code
// (fetchGooglePlaces, lib/source-prospects.ts) résoudrait ça, mais aucune
// GOOGLE_PLACES_API_KEY n'est configurée sur le projet — décision du
// 2026-09-15 de ne pas en ajouter pour l'instant. Prioriser un secteur
// qu'aucune source active ne peut peupler serait une promesse vide (voir
// SECTEURS_SANS_SOURCE_REELLE plus bas, qui documente ce cas précis pour
// l'UI). Nuisibles reste dans SECTEURS_ROTATION / SECTEUR_OSM au cas où une
// clé Google Places serait ajoutée plus tard — à rebrancher en priorité
// forte à ce moment-là, pas avant.
export const SECTEURS_PRIORITAIRES = new Set<string>(["vitrier", "couvreur"])
export const SECTEURS_SECONDAIRES = new Set<string>(["électricien", "serrurier", "chauffagiste"])

export const SECTEUR_PRIORITE_BONUS = 15
export const SECTEUR_SECONDAIRE_BONUS = 7

// Bonus de tri appliqué à un secteur donné (0 si neutre). Ne modifie jamais
// le score stocké d'un prospect existant — voir son usage dans
// lib/source-prospects.ts (nouveaux prospects sourcés, où le score n'est
// pas encore saturé).
export function secteurPrioriteBonus(secteur: string): number {
  const s = secteur.toLowerCase().trim()
  if (SECTEURS_PRIORITAIRES.has(s)) return SECTEUR_PRIORITE_BONUS
  if (SECTEURS_SECONDAIRES.has(s)) return SECTEUR_SECONDAIRE_BONUS
  return 0
}

// Rang de priorité métier (0 = forte, 1 = secondaire, 2 = neutre), utilisé
// pour un TRI À DEUX NIVEAUX plutôt qu'un bonus additif — voir
// app/api/whatsapp/route.ts. Le score de diagnostic (scoreProspect) plafonne
// à 100 et une bonne partie du haut de la liste (~2500 prospects) l'atteint
// déjà (site pourri + beaucoup d'avis = plusieurs flags cumulés au-delà de
// 100, écrêtés) : un bonus additif de +15 ne peut pas faire remonter un
// nuisibles à 85 au-dessus d'un menuisier déjà à 100, alors que c'est
// exactement le but recherché. Le tri à deux niveaux règle ça sans plafond :
// le métier prioritaire passe TOUJOURS avant, quel que soit le score des uns
// et des autres ; à l'intérieur d'un même rang, le score départage comme
// avant.
export function secteurPrioriteTier(secteur: string): number {
  const s = secteur.toLowerCase().trim()
  if (SECTEURS_PRIORITAIRES.has(s)) return 0
  if (SECTEURS_SECONDAIRES.has(s)) return 1
  return 2
}

// Secteurs sourcés par SECTEURS_ROTATION mais qui n'ont aujourd'hui aucun
// site lead capable de recevoir les demandes générées (pas de site dédié,
// ou trafic non mesuré) — sert uniquement au badge d'avertissement du
// sélecteur de secteur (voir WhatsappBoard.tsx), pas au sourcing lui-même.
export const SECTEURS_SANS_SITE = new Set<string>(["débouchage", "plombier", "humidité", "dégâts des eaux"])

// Sites leads dont le métier ne peut concrètement ramener AUCUN prospect
// aujourd'hui, malgré un `secteur` déclaré dans le code — soit parce
// qu'aucun secteur sourcé n'existe pour lui du tout (bornes), soit parce que
// le secteur existe mais que la seule source active (OSM, gratuite) ne
// contient quasiment pas ce type d'entreprise en Belgique (nuisibles — voir
// le commentaire détaillé sur SECTEURS_PRIORITAIRES). Différent de
// SECTEURS_SANS_SITE, qui liste des secteurs qui SONT sourcés ET peuplés
// mais dont le SITE LEAD correspondant ne performe pas encore. Ne peut pas
// apparaître dans le sélecteur de secteur de /whatsapp (qui ne liste que les
// secteurs déjà présents en base, donc "nuisibles" avec 0 prospect n'y
// apparaît jamais non plus) — affiché à part dans la barre d'outils pour que
// ça reste visible plutôt que silencieux.
export const SITES_SANS_SECTEUR_SOURCE: { site: string; motif: string }[] = [
  { site: "Bornes de recharge (borneinstall.be)", motif: "aucun tag OSM ne distingue un installateur de bornes d'un électricien — pas de sourcing dédié possible aujourd'hui" },
  { site: "Allo Guêpes / SOS Punaises (nuisibles)", motif: "secteur sourcé mais 0 résultat OSM constaté en prod (3 pest_control sur toute la Belgique) — nécessite une clé Google Places, pas encore configurée" },
]

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
// canal de réponse rapide, pas un canal de lecture. Pas de signature "Ilias"
// dans le corps du message : sur WhatsApp le prénom est déjà visible sur le
// profil, le répéter sonne comme un template. On ancre sur un manque à
// gagner concret ("j'ai eu des demandes que je n'ai pas pu transmettre")
// plutôt qu'un pitch générique — ça crée une urgence réelle (du business
// perdu, là, maintenant) sans sonner comme un démarchage.
//
// Pas de chiffre de volume ("3 demandes") : aucune donnée réelle de demandes
// ratées par métier/commune n'existe dans le pipeline — l'inventer serait
// exactement le genre de statut fabriqué que le correctif KPI du 2026-09-01
// a retiré (voir plus haut). "Des demandes" reste générique et honnête.
//
// Révèle l'offre "prochaine gratuite" dès ce premier message (changement du
// 2026-09-16 — auparavant réservée au closing, WHATSAPP_CLOSING_MESSAGE plus
// bas) : choix assumé de sacrifier la carte de négociation du closing contre
// un premier message plus accrocheur.
export const WHATSAPP_MESSAGE_TEMPLATE =
  "Bonjour, j'ai eu des demandes de {metier} sur {commune} cette semaine que je n'ai pas pu transmettre.\n\n" +
  "Je gère le site, je ne fais pas le métier.\n\n" +
  "Vous prenez encore des clients en ce moment ?\n\n" +
  "Si oui je vous envoie la prochaine gratuitement, vous voyez ce que ça vaut."

export function whatsappMessage(secteur: string, commune: string): string {
  const metier = secteurMeta(secteur).motCle
  return WHATSAPP_MESSAGE_TEMPLATE.replace("{metier}", metier).replace("{commune}", commune)
}

// Ne re-propose pas par défaut un prospect déjà contacté via WhatsApp il y a
// moins de 90 jours (voir WhatsappContact dans schema.prisma) — évite de
// spammer deux fois la même entreprise en dessous d'un délai raisonnable de
// relance.
export const CONTACT_COOLDOWN_JOURS = 90

// ── SCRIPTS DE RÉPONSE ──
//
// Pré-réponses pour la suite de la conversation WhatsApp, affichées dans
// l'onglet /reponses. Trois familles : les objections les plus fréquentes
// (à copier-coller telles quelles ou à adapter), le message de closing une
// fois que le prospect dit oui, et un rappel des principes qui font que ça
// sonne humain (ne jamais nier, ne jamais mentir sur le statut de société —
// un artisan repère le baratin en trois secondes).
export interface Objection {
  question: string
  reponse: string
}

export const OBJECTIONS: Objection[] = [
  {
    question: "« C'est combien ? »",
    reponse: "La prochaine est offerte. Après, on se cale sur ce que ça vous rapporte réellement, pas sur un forfait.",
  },
  {
    question: "« C'est comme Bobex, j'ai déjà donné. »",
    reponse: "La différence, c'est que je n'envoie pas la même demande à cinq artisans. Vous êtes seul dessus.",
  },
  {
    question: "« Vous êtes une société ? »",
    reponse: "Pas encore, je démarre. C'est aussi pour ça que la prochaine demande est gratuite.",
  },
]

// Message de closing : envoyé une fois que le prospect a dit oui (ou une
// variante de oui). Explique le mécanisme en trois temps courts (comment ça
// marche → pourquoi c'est gratuit au début → l'action immédiate qu'on
// attend de lui), et termine par une question fermée à choix binaire plutôt
// qu'une question ouverte — plus facile et plus rapide à répondre sur
// WhatsApp. Aligné le 2026-09-16 sur "la prochaine" (1 seule offerte) pour
// rester cohérent avec WHATSAPP_MESSAGE_TEMPLATE, qui révèle désormais cette
// offre dès le premier message plutôt qu'au closing.
export const WHATSAPP_CLOSING_MESSAGE =
  "Parfait. Concrètement : quand une demande arrive, je vous envoie le contact avec le problème et l'adresse. " +
  "Vous rappelez, vous décidez si vous prenez.\n\n" +
  "Je paie la publicité, vous ne payez rien pour ça. La prochaine demande est offerte pour que vous voyiez " +
  "ce que ça vaut. Ensuite on se met d'accord sur un prix par appel.\n\n" +
  "Je vous l'envoie dès qu'elle arrive. SMS ou téléphone ?"
