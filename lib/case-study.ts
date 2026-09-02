import caseStudyRaw from "@/config/case-study.json"

// Garde-fou pour une future variante de l'email J+3 qui citerait des
// chiffres de campagne réels (appels reçus, coût par appel) — l'étude de
// cas mentionnée pour le 2026-09-08. Aujourd'hui adsEmail2Offre()
// (lib/email-templates.ts) ne cite aucun chiffre de campagne, donc rien
// n'appelle encore caseStudyReady() en pratique : ce fichier prépare le
// terrain plutôt que de corriger un email qui utiliserait déjà ces valeurs.
//
// Import JSON typé statiquement : si quelqu'un modifie config/case-study.json
// et retire un champ, le typecheck échoue avant même d'exécuter quoi que ce soit.
export interface CaseStudy {
  secteur: string
  zone: string
  periodeJours: number
  appels: string | number
  coutParAppel: string | number
  disponibleLe: string
}

export const caseStudy: CaseStudy = caseStudyRaw as CaseStudy

// Faux dès qu'un champ vaut "TODO", est vide, ou n'est pas un nombre —
// aucune valeur par défaut, aucun repli qui masquerait le trou.
export function caseStudyReady(): boolean {
  for (const valeur of [caseStudy.appels, caseStudy.coutParAppel]) {
    if (valeur === "TODO" || valeur === "" || valeur === null || valeur === undefined) return false
    if (typeof valeur === "string" && !/^\d+([.,]\d+)?$/.test(valeur.trim())) return false
  }
  return true
}
