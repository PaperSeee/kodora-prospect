import { prisma } from "@/lib/prisma"

// Envoie un rapport récap par email après chaque run du pipeline.
// Chiffres du jour : sourcés / générés / envoyés + stock restant + plafond.

const REPORT_TO = process.env.PIPELINE_REPORT_EMAIL ?? "ilias0703@hotmail.com"

interface ReportData {
  cap: number
  sourced: number
  generated: number
  sent: number
  status: "done" | "error"
  error?: string
}

export async function sendPipelineReport(data: ReportData): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) return // pas de Brevo → pas de rapport, on n'échoue pas pour autant

  // Stock restant : prospects prêts à contacter (email + corps générés).
  const stockRestant = await prisma.prospect.count({
    where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
  })

  const dateFr = new Date().toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const ok = data.status === "done"
  const titre = ok ? "✅ Rapport pipeline" : "⚠️ Pipeline en erreur"

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
      <h2 style="color:#1a56db;margin-bottom:4px">${titre}</h2>
      <p style="color:#6b7280;margin-top:0;text-transform:capitalize">${dateFr}</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">🔍 Prospects sourcés</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${data.sourced}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">✍️ Emails générés</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${data.generated}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">📤 Emails envoyés</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${data.sent} / ${data.cap}</td></tr>
        <tr><td style="padding:8px 0">📦 Stock restant à contacter</td><td style="padding:8px 0;text-align:right;font-weight:700">${stockRestant}</td></tr>
      </table>
      ${data.error ? `<p style="color:#b91c1c;font-size:13px;background:#fee2e2;padding:10px;border-radius:6px">Erreur : ${data.error}</p>` : ""}
      ${stockRestant < 20 ? `<p style="color:#92400e;font-size:13px;background:#fef3c7;padding:10px;border-radius:6px">⚠️ Stock bas — pense à sourcer plus de prospects.</p>` : ""}
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">Kodora Prospect — pipeline automatique</p>
    </div>`

  const texte =
    `${titre} — ${dateFr}\n` +
    `Sourcés: ${data.sourced} | Générés: ${data.generated} | Envoyés: ${data.sent}/${data.cap} | Stock: ${stockRestant}` +
    (data.error ? `\nErreur: ${data.error}` : "")

  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: {
          name: "Kodora Pipeline",
          email: process.env.BREVO_SENDER_EMAIL ?? "ilias300@outlook.be",
        },
        to: [{ email: REPORT_TO }],
        subject: `${titre} — ${data.sent} envoyés aujourd'hui`,
        htmlContent: html,
        textContent: texte,
      }),
    })
  } catch (err) {
    console.error("[pipeline] report email error:", err)
  }
}
