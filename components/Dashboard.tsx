"use client"

import { useEffect, useState, useCallback } from "react"

interface Stats {
  total: number
  parStatut: Record<string, number>
  parSecteur: { secteur: string; count: number }[]
  avgScore: number
  maxScore: number
  scoreSuperieur50: number
  avecEmail: number
  avecEmailCorps: number
  recents: { id: number; nom: string; secteur: string; score: number; statut: string; createdAt: string }[]
  definitions: Record<string, string>
}

interface SendEvent {
  type: "start" | "sent" | "error" | "done"
  total?: number
  count?: number
  nom?: string
  prospectId?: number
  error?: string
  errors?: string[]
}

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  a_contacter: { label: "À contacter", color: "bg-zinc-600" },
  en_file: { label: "En file", color: "bg-slate-600" },
  contacte: { label: "Contacté (délivré)", color: "bg-blue-600" },
  audit_vu: { label: "Audit vu", color: "bg-cyan-600" },
  cta_clique: { label: "CTA cliqué", color: "bg-orange-600" },
  a_repondu: { label: "A répondu", color: "bg-amber-600" },
  rdv: { label: "RDV", color: "bg-purple-600" },
  signe: { label: "Signé", color: "bg-emerald-600" },
  bounce: { label: "Bounce", color: "bg-red-700" },
  bloque: { label: "Bloqué", color: "bg-red-700" },
  spam: { label: "Signalé spam", color: "bg-red-800" },
  desabonne: { label: "Désabonné", color: "bg-zinc-700" },
  // Pas de site réel = pas de page où envoyer le trafic payant Google Ads.
  ecarte_pas_de_site: { label: "Écarté (pas de site)", color: "bg-neutral-700" },
  // Historique d'avant le correctif KPI (2026-09-01) — jamais confirmés par
  // un événement vérifié, voir le bandeau d'avertissement plus bas.
  contacte_non_verifie: { label: "Contacté (non vérifié)", color: "bg-blue-950" },
  audit_vu_non_verifie: { label: "Audit vu (non vérifié)", color: "bg-cyan-950" },
  cta_clique_non_verifie: { label: "CTA cliqué (non vérifié)", color: "bg-orange-950" },
}

const STATUTS_NON_VERIFIES = ["contacte_non_verifie", "audit_vu_non_verifie", "cta_clique_non_verifie"]

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-red-400" : s >= 50 ? "text-orange-400" : s >= 30 ? "text-yellow-400" : "text-zinc-400"

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [sending, setSending] = useState(false)
  const [sendLog, setSendLog] = useState<SendEvent[]>([])
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null)
  const [sentIds, setSentIds] = useState<Set<number>>(new Set())

  // Agent de sourcing local (scripts/sourcing-agent.ts) — tourne sur la
  // machine d'Ilias, hors du plafond 60s Vercel. Le dashboard ne fait que
  // relayer via /api/pipeline/local-agent ; voir ce fichier pour le pourquoi.
  const [agentStatus, setAgentStatus] = useState<{ configured: boolean; reachable: boolean } | null>(null)
  const [sourcing, setSourcing] = useState(false)
  const [sourcingLog, setSourcingLog] = useState<string[]>([])
  const [sourcingResult, setSourcingResult] = useState<{ sourced: number; generated: number; stockPret: number; arretPourEchecs?: boolean } | null>(null)

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/stats")
    setStats(await res.json())
  }, [])

  const checkAgent = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/local-agent")
      setAgentStatus(await res.json())
    } catch {
      setAgentStatus({ configured: false, reachable: false })
    }
  }, [])

  useEffect(() => {
    loadStats()
    checkAgent()
    const interval = setInterval(loadStats, 15000)
    return () => clearInterval(interval)
  }, [loadStats, checkAgent])

  const sourceGrosVolume = async () => {
    const objectifStr = prompt("Combien de prospects viser ? (ex: 500)", "500")
    if (!objectifStr) return
    const objectif = Math.max(1, Math.min(2000, Number(objectifStr) || 200))

    setSourcing(true)
    setSourcingLog([])
    setSourcingResult(null)

    const res = await fetch("/api/pipeline/local-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectif }),
    })

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}))
      setSourcingLog((prev) => [...prev, `✗ ${err.error ?? "Erreur inconnue"}`])
      setSourcing(false)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        try {
          const evt = JSON.parse(line.slice(6))
          if (evt.type === "progress") setSourcingLog((prev) => [...prev.slice(-40), evt.message])
          if (evt.type === "error") setSourcingLog((prev) => [...prev, `✗ ${evt.message}`])
          if (evt.type === "done") {
            setSourcingResult({ sourced: evt.sourced, generated: evt.generated, stockPret: evt.stockPret, arretPourEchecs: evt.arretPourEchecs })
            loadStats()
          }
        } catch {}
      }
    }
    setSourcing(false)
  }

  const sendBatch = async () => {
    if (!confirm("Envoyer tous les emails prêts maintenant ?")) return
    setSending(true)
    setSendLog([])
    setSendProgress(null)
    setSentIds(new Set())

    const res = await fetch("/api/send-email/batch-stream", { method: "POST" })
    if (!res.body) { setSending(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        try {
          const evt: SendEvent = JSON.parse(line.slice(6))
          setSendLog((prev) => [...prev, evt])
          if (evt.type === "start") setSendProgress({ done: 0, total: evt.total! })
          if (evt.type === "sent") {
            setSendProgress((p) => p ? { ...p, done: evt.count! } : null)
            if (evt.prospectId) setSentIds((prev) => new Set([...prev, evt.prospectId!]))
          }
          if (evt.type === "done") {
            setSending(false)
            loadStats()
          }
        } catch {}
      }
    }
    setSending(false)
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Chargement du dashboard...
      </div>
    )
  }

  const pret = (stats.parStatut["a_contacter"] ?? 0)
  const conversionRate = stats.total > 0 ? Math.round(((stats.parStatut["signe"] ?? 0) / stats.total) * 100) : 0
  const emailRate = stats.total > 0 ? Math.round((stats.avecEmail / stats.total) * 100) : 0

  const totalNonVerifie = STATUTS_NON_VERIFIES.reduce((sum, k) => sum + (stats.parStatut[k] ?? 0), 0)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">

      {totalNonVerifie > 0 && (
        <div className="rounded-xl border border-red-800 bg-red-950/60 px-5 py-3 text-sm text-red-200">
          ⚠️ <strong>{totalNonVerifie} prospect(s)</strong> portent un statut antérieur au correctif KPI du
          2026-09-01 — <em>données non vérifiées</em> (contacte_non_verifie, audit_vu_non_verifie,
          cta_clique_non_verifie). Ces statuts venaient d&apos;un res.ok Brevo ou d&apos;une vue/clic non
          filtrés des robots, jamais d&apos;un événement confirmé. Voir le détail par statut ci-dessous.
        </div>
      )}

      {/* Sourcing gros volume — agent local, hors plafond 60s Vercel */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Sourcing gros volume</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            agentStatus?.reachable ? "bg-emerald-900 text-emerald-300" : "bg-zinc-800 text-zinc-500"
          }`}>
            {agentStatus?.reachable ? "● Agent local connecté" : agentStatus?.configured ? "○ Agent configuré, injoignable" : "○ Agent non configuré"}
          </span>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Sourcing sans limite de temps (contrairement au bouton &laquo; Préparer un gros stock &raquo; sur /sourcer, plafonné à 52s par Vercel) — tourne sur ta machine via <code className="text-zinc-400">scripts/sourcing-agent.ts</code>, relayé ici par tunnel.
        </p>
        {!agentStatus?.reachable && (
          <AgentSetupInstructions configured={agentStatus?.configured ?? false} />
        )}
        <button
          onClick={sourceGrosVolume}
          disabled={sourcing || !agentStatus?.reachable}
          className="w-full rounded-lg bg-indigo-700 py-2.5 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sourcing ? "Sourcing en cours..." : "🌍 Sourcer un gros volume"}
        </button>
        {sourcingResult && (
          <p className={`mt-2 text-xs ${sourcingResult.arretPourEchecs ? "text-amber-400" : "text-emerald-400"}`}>
            {sourcingResult.arretPourEchecs ? "⚠️" : "✅"} {sourcingResult.sourced} sourcés, {sourcingResult.generated} emails générés, {sourcingResult.stockPret} prêts à contacter.
            {sourcingResult.arretPourEchecs && " Arrêté tôt — serveurs de sourcing gratuits probablement saturés, réessaie dans 15-30 min."}
          </p>
        )}
        {sourcingLog.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5 font-mono text-xs text-zinc-400">
            {sourcingLog.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Prospects total" value={stats.total} sub="dans la base" color="text-white" />
        <KpiCard label="Score ≥ 50" value={stats.scoreSuperieur50} sub={`score de sourcing — pas un signal d'intérêt`} color="text-orange-400" />
        <KpiCard label="Avec email" value={`${emailRate}%`} sub={`${stats.avecEmail} / ${stats.total}`} color="text-indigo-400" />
        <KpiCard label="Signés" value={stats.parStatut["signe"] ?? 0} sub={`${conversionRate}% conversion`} color="text-emerald-400" />
      </div>

      {/* Funnel + Secteurs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-300 uppercase tracking-wider">Funnel</h2>
          <div className="space-y-2">
            {Object.entries(STATUT_LABELS).map(([key, { label, color }]) => {
              const count = stats.parStatut[key] ?? 0
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-semibold text-white">{count}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-800">
                    <div
                      className={`h-2 rounded-full transition-all ${color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top secteurs */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-300 uppercase tracking-wider">Top secteurs</h2>
          <div className="space-y-2">
            {stats.parSecteur.map(({ secteur, count }) => {
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={secteur}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-zinc-400 capitalize">{secteur}</span>
                    <span className="font-semibold text-white">{count}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800">
                    <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Score + Email stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Scores</h2>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-3xl font-bold text-white">{stats.avgScore}</p>
              <p className="text-xs text-zinc-500">score moyen</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-orange-400">{stats.maxScore}</p>
              <p className="text-xs text-zinc-500">score max</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Emails</h2>
          <div className="space-y-2">
            <MiniStat label="Adresse trouvée" value={stats.avecEmail} total={stats.total} color="bg-indigo-500" />
            <MiniStat label="Corps généré" value={stats.avecEmailCorps} total={stats.total} color="bg-purple-500" />
            <MiniStat label="Prêts à envoyer" value={Math.min(stats.avecEmail, stats.avecEmailCorps)} total={stats.total} color="bg-emerald-500" />
          </div>
        </div>

        {/* Send batch */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Envoi batch</h2>
          {sendProgress && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-zinc-400">
                <span>Envoi en cours...</span>
                <span>{sendProgress.done}/{sendProgress.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(sendProgress.done / sendProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <button
            onClick={sendBatch}
            disabled={sending || pret === 0}
            className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? `Envoi... ${sendProgress ? `${sendProgress.done}/${sendProgress.total}` : ""}` : `📤 Envoyer ${pret} email(s)`}
          </button>
          {sendLog.length > 0 && (
            <div className="max-h-32 overflow-y-auto space-y-0.5 font-mono text-xs">
              {sendLog.filter(e => e.type === "sent" || e.type === "error" || e.type === "done").map((e, i) => (
                <div key={i} className={e.type === "error" ? "text-red-400" : e.type === "done" ? "text-emerald-400 font-semibold" : "text-zinc-400"}>
                  {e.type === "sent" && `✓ ${e.nom}`}
                  {e.type === "error" && `✗ ${e.nom}`}
                  {e.type === "done" && `✅ ${e.count} envoyé(s)`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recents */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-300 uppercase tracking-wider">Derniers prospects ajoutés</h2>
        <div className="space-y-2">
          {stats.recents.map((p) => {
            const s = STATUT_LABELS[p.statut]
            const wasSent = sentIds.has(p.id)
            return (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-zinc-800 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-white">{p.nom}</span>
                  <span className="ml-2 text-xs text-zinc-500">{p.secteur}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${SCORE_COLOR(p.score)}`}>{p.score}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs text-white ${wasSent ? "bg-slate-600" : s?.color ?? "bg-zinc-600"}`}>
                    {/* "En file" = accepté par Brevo, pas remis — "Contacté" n'est vrai qu'après le webhook delivered */}
                    {wasSent ? "En file ✓" : s?.label ?? p.statut}
                  </span>
                </div>
              </div>
            )
          })}
          {stats.recents.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun prospect — lance un sourcing !</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Panneau de commandes à copier-coller quand l'agent local n'est pas
// joignable — évite de devoir ressortir la procédure à chaque redémarrage
// du Mac ou de ngrok (l'URL change à chaque relance de ngrok en compte
// gratuit, donc l'étape 3 est quasi systématique).
function AgentSetupInstructions({ configured }: { configured: boolean }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500)
  }

  const steps: { label: string; cmd: string }[] = [
    { label: "1. Lancer l'agent (le laisser tourner)", cmd: "npx tsx scripts/sourcing-agent.ts" },
    { label: "2. Ouvrir le tunnel, dans un autre terminal (le laisser tourner)", cmd: "ngrok http 3999" },
    { label: "3. Récupérer l'URL publique du tunnel", cmd: "curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[a-z0-9.-]*\\.ngrok-free\\.\\(app\\|dev\\)' | head -1" },
  ]

  return (
    <div className="mb-3 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
      <p className="mb-2 text-xs text-amber-400">
        {configured ? "Agent injoignable — relance-le sur ton Mac :" : "Agent jamais configuré — première mise en route :"}
      </p>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i}>
            <p className="mb-1 text-[11px] text-zinc-500">{step.label}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300">
                {step.cmd}
              </code>
              <button
                onClick={() => copy(step.cmd, i)}
                className="shrink-0 rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700"
              >
                {copiedIdx === i ? "✓ copié" : "copier"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500">
        4. Colle l&apos;URL affichée par l&apos;étape 3 dans Vercel → Settings → Environment Variables → <code className="text-zinc-400">SOURCING_AGENT_URL</code>{configured ? "" : <>, avec <code className="text-zinc-400">SOURCING_AGENT_KEY</code> = la clé de ton <code className="text-zinc-400">.env.local</code></>} — puis redéploie. Le badge ci-dessus repasse au vert une fois le nouveau déploiement actif.
      </p>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{sub}</p>
    </div>
  )
}

function MiniStat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-white font-semibold">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
