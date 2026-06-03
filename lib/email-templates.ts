import type { DiagnosticFlag } from "./diagnose"

// ── Nouveau template funnel audit ────────────────────────────────
// Utilisé quand un audit LokalSEO a été généré pour le prospect

const OBJETS_AUDIT = [
  (nom: string) => `${nom}, votre site`,
  (nom: string) => `Question rapide sur ${nom}`,
  (_nom: string) => `Audit gratuit — 30 secondes`,
]

function pickAuditObjet(nom: string): string {
  const idx = nom.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % OBJETS_AUDIT.length
  const fn = OBJETS_AUDIT[idx]
  const result = fn(nom)
  // Tronquer à 50 chars
  return result.length > 50 ? result.slice(0, 47) + "..." : result
}

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
  const prenom = nom.split(" ")[0]
  const idx = nom.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % OBJETS_NO_SITE.length
  const objet = OBJETS_NO_SITE[idx](nom).slice(0, 50)
  const avisText = avis && avis > 0 ? ` — vous avez ${avis} avis Google` : ""

  const corps = `Bonjour ${prenom},

Je cherchais des ${secteur} à ${ville} et je n'ai pas trouvé de site web pour ${nom}${avisText}.

Beaucoup de clients cherchent en ligne avant d'appeler — sans site, ces demandes vont chez vos confrères.

Je crée des sites vitrines pour des ${secteur} en 7 jours, à partir de 299 €. Si ça vous intéresse, répondez simplement à ce mail.

Bonne journée,
Ilias — Kodora
kodora.eu · +32 451 05 33 70

P.S. — Si ce mail ne vous intéresse pas, ignorez-le simplement.`

  return { objet, corps }
}

export function auditEmailTemplate(
  nom: string,
  score: number,
  nbProblemes: number,
  auditUrl: string,
): { objet: string; corps: string; html: string } {
  const prenom = nom.split(" ")[0]
  const objet = pickAuditObjet(nom)

  const corps = `Bonjour ${prenom},

J'ai fait un audit rapide de la présence en ligne de ${nom} ce matin.

Score actuel : ${score}/100 — ${nbProblemes} axe${nbProblemes > 1 ? "s" : ""} prioritaire${nbProblemes > 1 ? "s" : ""} identifié${nbProblemes > 1 ? "s" : ""}.

Voir le rapport complet (sans inscription) :
${auditUrl}

Aucune obligation, juste un état des lieux.

Bonne journée,
Ilias — Kodora

P.S. — Si ce mail ne vous intéresse pas, ignorez-le simplement, je ne vous recontacterai pas.`

  const scoreColor = score >= 70 ? "#16a34a" : score >= 45 ? "#d97706" : "#dc2626"

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px">Kodora</p>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">Présence web pour professionnels belges</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 16px;color:#1e293b;font-size:15px;line-height:1.6">Bonjour ${prenom},</p>
            <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.6">
              J'ai fait un audit rapide de la présence en ligne de <strong>${nom}</strong> ce matin.
            </p>
            <!-- Score box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px">
              <tr>
                <td style="padding:20px 24px">
                  <p style="margin:0 0 4px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px">Score de visibilité</p>
                  <p style="margin:0;font-size:36px;font-weight:800;color:${scoreColor}">${score}<span style="font-size:18px;color:#94a3b8">/100</span></p>
                  <p style="margin:8px 0 0;color:#475569;font-size:13px">
                    ${nbProblemes} axe${nbProblemes > 1 ? "s" : ""} prioritaire${nbProblemes > 1 ? "s" : ""} identifié${nbProblemes > 1 ? "s" : ""} — détail complet dans le rapport.
                  </p>
                </td>
              </tr>
            </table>
            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td align="center">
                  <a href="${auditUrl}" target="_blank"
                    style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;letter-spacing:-0.2px">
                    Voir mon rapport complet →
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top:10px">
                  <p style="margin:0;color:#94a3b8;font-size:11px">Sans inscription · Prend 30 secondes</p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;color:#334155;font-size:14px;line-height:1.6">
              Aucune obligation — c'est juste un état des lieux.
            </p>
            <p style="margin:0;color:#334155;font-size:14px;line-height:1.6">
              Bonne journée,<br>
              <strong>Ilias</strong> — Kodora<br>
              <a href="https://kodora.eu" style="color:#2563eb;text-decoration:none">kodora.eu</a> · +32 451 05 33 70
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px">
            <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6">
              P.S. — Si ce mail ne vous intéresse pas, ignorez-le simplement, je ne vous recontacterai pas.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { objet, corps, html }
}

export function auditWarmFollowUpTemplate(
  nom: string,
  auditUrl: string,
): { objet: string; corps: string } {
  const prenom = nom.split(" ")[0]
  return {
    objet: "Une question sur votre audit ?",
    corps: `Bonjour ${prenom},

J'ai vu que vous avez consulté votre audit. Y a-t-il un point que vous souhaitez clarifier ou une question sur les résultats ?

Le rapport est toujours accessible ici : ${auditUrl}

Bonne journée,
Ilias — Kodora

P.S. — Si vous n'êtes pas intéressé, ignorez simplement ce message.`,
  }
}



// Objets variés pour éviter la répétition qui déclenche les filtres spam
const OBJETS_SITE_ABSENT = [
  "Une question rapide",
  "J'ai cherché votre site",
  "Petite question",
  "Je n'ai pas trouvé votre site",
]

const OBJETS_SITE_HS = [
  "Votre site semble avoir un problème",
  "J'ai essayé de visiter votre site",
  "Petit souci sur votre site",
  "Votre site ne répond plus",
]

const OBJETS_MOBILE = [
  "Un détail sur votre site",
  "J'ai regardé votre site sur mobile",
  "Petite observation",
  "Votre site et les smartphones",
]

const OBJETS_DATE = [
  "Une observation sur votre site",
  "J'ai regardé votre site",
  "Votre site mérite une mise à jour",
  "Petit retour sur votre présence web",
]

const OBJETS_LENT = [
  "Votre site charge lentement",
  "J'ai testé votre site",
  "Un point technique sur votre site",
  "Performance de votre site",
]

function pick(arr: string[], nom: string): string {
  // Déterministe selon le nom pour éviter l'aléatoire pur (reproductible)
  const idx = nom.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % arr.length
  return arr[idx]
}

export function staticEmailTemplate(
  nom: string,
  secteur: string,
  flags: DiagnosticFlag[],
  avis?: number | null
): { objet: string; corps: string } | null {
  const has = (f: string) => flags.some((fl) => fl === f || fl.startsWith(f))
  const avisText = avis && avis > 0 ? ` (vous avez ${avis} avis Google)` : ""

  let objet = ""
  let corps = ""

  if (has("AUCUN_SITE")) {
    objet = pick(OBJETS_SITE_ABSENT, nom)
    corps = `Bonjour,

Je cherchais des ${secteur} à ${avisText ? "Bruxelles" : "Bruxelles"} et je n'ai pas trouvé de site pour votre cabinet${avisText}.

Beaucoup de clients potentiels cherchent en ligne avant d'appeler — sans site, ces demandes vont chez vos confrères.

Je m'appelle Ilias, je crée des sites vitrines pour des professionnels comme vous. Livraison en une semaine, à partir de 299 €.

Si ça vous intéresse, répondez simplement à ce mail — je vous montre des exemples concrets.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("SITE_INACCESSIBLE") || has("SITE_HS_")) {
    objet = pick(OBJETS_SITE_HS, nom)
    corps = `Bonjour,

J'ai voulu visiter votre site web mais il semble inaccessible en ce moment${avisText}.

Ce genre de panne fait souvent perdre des contacts — les visiteurs partent sans rappeler.

Je m'appelle Ilias, je travaille avec des ${secteur} pour améliorer leur présence en ligne. Si vous souhaitez qu'on regarde ça ensemble, répondez à ce mail.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("PAS_MOBILE")) {
    objet = pick(OBJETS_MOBILE, nom)
    corps = `Bonjour,

J'ai regardé votre site depuis mon téléphone et il s'affiche mal — texte trop petit, boutons difficiles à cliquer${avisText}.

Aujourd'hui plus de 70% des recherches locales se font sur mobile. Un site non adapté fait fuir ces visiteurs.

Je m'appelle Ilias, je crée des sites optimisés mobile pour des ${secteur}. Répondez à ce mail si vous voulez qu'on en parle.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

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
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`

  } else if (has("SITE_LENT")) {
    objet = pick(OBJETS_LENT, nom)
    corps = `Bonjour,

J'ai testé votre site — il met plus de 4 secondes à charger${avisText}. Google considère qu'au-delà de 3 secondes, la moitié des visiteurs abandonnent.

Je m'appelle Ilias, je crée des sites rapides et optimisés pour des ${secteur}. Répondez à ce mail si vous voulez en savoir plus.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`

  } else {
    // Fallback générique (PAS_HTTPS, flags inconnus, ou aucun flag)
    const objets = [
      "Une observation sur votre présence web",
      "J'ai regardé votre site",
      "Petite question sur votre site",
      "Un retour rapide sur votre site",
    ]
    objet = pick(objets, nom)
    corps = `Bonjour,

J'ai regardé votre présence en ligne et j'ai noté quelques points qui pourraient freiner vos contacts depuis le web${avisText}.

Je m'appelle Ilias, je travaille avec des ${secteur} pour améliorer leur visibilité en ligne. Si vous voulez qu'on en parle rapidement, répondez simplement à ce mail.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`
  }

  return { objet, corps }
}

export function relanceEmailTemplate(
  nom: string,
  secteur: string,
  emailOuvert: boolean
): { objet: string; corps: string } {
  const objets = emailOuvert
    ? ["Mon message de la semaine dernière", "Je reviens vers vous", "Suite à mon message"]
    : ["Juste au cas où", "Je me permets de revenir", "Un dernier mot"]

  const objet = pick(objets, nom)

  const corps = emailOuvert
    ? `Bonjour,

Je reviens vers vous suite à mon message de la semaine dernière.

Si vous avez eu l'occasion de le lire mais que le timing n'était pas bon, je comprends tout à fait. Je reste disponible si vous avez des questions sur votre site.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`
    : `Bonjour,

Je me permets de revenir vers vous — mon premier message s'est peut-être perdu.

En tant que ${secteur}, votre visibilité en ligne a un impact direct sur vos nouveaux clients. Si vous voulez qu'on en parle 10 minutes, répondez simplement à ce mail.

Ilias
Kodora — kodora.eu
+32 451 05 33 70

Pour ne plus recevoir mes messages, répondez STOP.`

  return { objet, corps }
}
