import type { DiagnosticFlag } from "./diagnose"

export function staticEmailTemplate(
  nom: string,
  secteur: string,
  flags: DiagnosticFlag[],
  avis?: number | null
): { objet: string; corps: string } {
  const has = (f: string) => flags.some((fl) => fl === f || fl.startsWith(f))
  const avisText = avis && avis > 0 ? ` alors que vous avez ${avis} avis en ligne` : ""

  let probleme = "votre présence en ligne mérite d'être renforcée"
  if (has("AUCUN_SITE")) probleme = "vous n'avez pas encore de site web"
  else if (has("SITE_INACCESSIBLE") || has("SITE_HS_"))
    probleme = `votre site web est actuellement inaccessible${avisText}`
  else if (has("PAS_MOBILE"))
    probleme = `votre site s'affiche mal sur mobile${avisText}`
  else if (has("SITE_DATE_")) probleme = `votre site semble dater de plusieurs années${avisText}`
  else if (has("PAS_HTTPS")) probleme = "votre site n'est pas sécurisé (pas de HTTPS)"
  else if (has("SITE_LENT")) probleme = "votre site est très lent à charger"

  const objet = `Votre présence en ligne — ${nom}`
  const corps = `Bonjour,

J'ai remarqué que ${probleme}. Pour un ${secteur} actif comme vous, c'est souvent une source de clients manqués chaque semaine.

Chez Kodora, nous créons des sites vitrines professionnels, livrés en une semaine, à partir de 299 €. Design soigné, optimisé pour mobile et Google.

Si vous avez quelques minutes cette semaine, je serais ravi de vous montrer ce que nous pourrions faire pour vous.

Ilias — Kodora
+32 451 05 33 70
https://www.kodora.eu

---
Répondez STOP pour ne plus recevoir nos messages.`

  return { objet, corps }
}

export function relanceEmailTemplate(
  nom: string,
  secteur: string,
  emailOuvert: boolean
): { objet: string; corps: string } {
  const objet = `Juste au cas où — ${nom}`

  const intro = emailOuvert
    ? `Je voulais revenir vers vous rapidement — mon message précédent vous a peut-être échappé.`
    : `Je me permets de revenir vers vous au sujet de votre présence en ligne.`

  const corps = `Bonjour,

${intro}

En tant que ${secteur}, votre réputation en ligne joue directement sur votre carnet de clients. Beaucoup de vos confrères ont déjà fait la démarche — certains voient 30% de nouveaux contacts en plus chaque mois.

Ce serait quoi, pour vous, un site qui travaille vraiment ? Je pose la question sincèrement — pas de présentation commerciale, juste un échange de 10 minutes si ça vous convient.

Ilias — Kodora
+32 451 05 33 70
https://www.kodora.eu

---
Répondez STOP pour ne plus recevoir nos messages.`

  return { objet, corps }
}
