// Alerte dure pour rendre la panne silencieuse impossible : avant ce
// correctif, le catch de pipeline/run/route.ts faisait un console.error et
// passait au suivant — un échec massif était invisible tant que personne
// n'allait lire les logs Vercel.
export function shouldAlertOnRunOutcome(input: { eligible: number; sent: number; failed: number }): string | null {
  const { eligible, sent, failed } = input
  const attempts = sent + failed

  if (eligible > 0 && sent === 0) {
    return `Pipeline : ${eligible} prospect(s) éligible(s) mais 0 envoyé(s).`
  }
  if (attempts > 0 && failed / attempts > 0.2) {
    return `Pipeline : taux d'échec ${Math.round((failed / attempts) * 100)}% (${failed}/${attempts} tentatives).`
  }
  return null
}

export async function notifyPipelineFailure(message: string): Promise<void> {
  const webhookUrl = process.env.LEAD_NOTIFY_WEBHOOK
  if (!webhookUrl) return
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `🚨 **${message}**` }),
  }).catch(() => {})
}
