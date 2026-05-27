"use client"

import { useEffect, useState, useCallback } from "react"

interface Stats {
  total: number
  parStatut: Record<string, number>
  parSecteur: { secteur: string; count: number }[]
  avgScore: number
  maxScore: number
  chauds: number
  avecEmail: number
  avecEmailCorps: number
  recents: { id: number; nom: string; secteur: string; score: number; statut: string; createdAt: string }[]
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
  contacte: { label: "Contacté", color: "bg-blue-600" },
  a_repondu: { label: "A répondu", color: "bg-amber-600" },
  rdv: { label: "RDV", color: "bg-purple-600" },
  signe: { label: "Signé", color: "bg-emerald-600" },
}

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-red-400" : s >= 50 ? "text-orange-400" : s >= 30 ? "text-yellow-400" : "text-zinc-400"

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [sending, setSending] = useState(false)
  const [sendLog, setSendLog] = useState<SendEvent[]>([])
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null)
  const [sentIds, setSentIds] = useState<Set<number>>(new Set())

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/stats")
    setStats(await res.json())
  }, [])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 15000)
    return () => clearInterval(interval)
  }, [loadStats])

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

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Prospects total" value={stats.total} sub="dans la base" color="text-white" />
        <KpiCard label="Chauds 🔥" value={stats.chauds} sub={`score ≥ 50`} color="text-orange-400" />
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
                  <span className={`rounded-full px-2 py-0.5 text-xs text-white ${wasSent ? "bg-blue-600" : s?.color ?? "bg-zinc-600"}`}>
                    {wasSent ? "Contacté ✓" : s?.label ?? p.statut}
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
