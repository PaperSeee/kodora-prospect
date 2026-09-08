"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { isMobileBe, whatsappUrl, toTelHref } from "@/lib/phone"
import { whatsappMessage } from "@/lib/pipeline-config"

interface Row {
  id: number
  nom: string
  secteur: string
  ville: string
  telephone: string | null
  siteWeb: string | null
  note: number | null
  avis: number | null
  angle: string | null
  score: number
  goldStar: boolean
}

const LOCAL_KEY = "whatsapp-board-contacted"

type LocalContacted = Record<number, string> // prospectId -> ISO date

function loadLocalContacted(): LocalContacted {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}")
  } catch {
    return {}
  }
}

function saveLocalContacted(v: LocalContacted) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(v))
  } catch {}
}

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-red-400" : s >= 50 ? "text-orange-400" : s >= 30 ? "text-yellow-400" : "text-zinc-400"

export function WhatsappBoard() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cooldownJours, setCooldownJours] = useState(90)
  const [contacted, setContacted] = useState<LocalContacted>({})
  const [communeFilter, setCommuneFilter] = useState("")
  const [secteurFilter, setSecteurFilter] = useState("")
  const [hideContacted, setHideContacted] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch("/api/whatsapp")
    const data = await res.json()
    setRows(data.rows)
    setCooldownJours(data.cooldownJours)
  }, [])

  useEffect(() => {
    load()
    setContacted(loadLocalContacted())
  }, [load])

  const toggleContacted = async (id: number) => {
    const already = !!contacted[id]
    const next = { ...contacted }
    if (already) {
      delete next[id]
      setContacted(next)
      saveLocalContacted(next)
      await fetch("/api/whatsapp/contacted", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: id }),
      })
    } else {
      const now = new Date().toISOString()
      next[id] = now
      setContacted(next)
      saveLocalContacted(next)
      await fetch("/api/whatsapp/contacted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: id }),
      })
    }
  }

  const communes = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.ville))].sort(),
    [rows]
  )
  const secteurs = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.secteur))].sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (communeFilter && r.ville !== communeFilter) return false
      if (secteurFilter && r.secteur !== secteurFilter) return false
      if (hideContacted && contacted[r.id]) return false
      return true
    })
  }, [rows, communeFilter, secteurFilter, hideContacted, contacted])

  if (!rows) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Chargement du tableau WhatsApp...
      </div>
    )
  }

  const totalContactes = rows.filter((r) => contacted[r.id]).length
  const totalRestants = rows.length - totalContactes

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-4">
        <CounterCard label="Total" value={rows.length} color="text-white" />
        <CounterCard label="Contactés" value={totalContactes} color="text-emerald-400" />
        <CounterCard label="Restants" value={totalRestants} color="text-orange-400" />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <select
          value={communeFilter}
          onChange={(e) => setCommuneFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-600 focus:outline-none"
        >
          <option value="">Toutes les communes</option>
          {communes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={secteurFilter}
          onChange={(e) => setSecteurFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 capitalize focus:border-emerald-600 focus:outline-none"
        >
          <option value="">Tous les métiers</option>
          {secteurs.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>

        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={hideContacted}
            onChange={(e) => setHideContacted(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-emerald-600"
          />
          Masquer les contactés
        </label>

        <span className="text-xs text-zinc-600">
          Exclut par défaut les prospects contactés il y a moins de {cooldownJours} jours
        </span>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Commune</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Avis</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Défaut détecté</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Contact</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <ProspectRow
                key={r.id}
                row={r}
                contactedAt={contacted[r.id] ?? null}
                onToggleContacted={() => toggleContacted(r.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-600">
                  Aucun prospect pour ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProspectRow({
  row,
  contactedAt,
  onToggleContacted,
}: {
  row: Row
  contactedAt: string | null
  onToggleContacted: () => void
}) {
  const mobile = isMobileBe(row.telephone)
  const message = whatsappMessage(row.secteur, row.ville)
  const waUrl = row.telephone && mobile ? whatsappUrl(row.telephone, message) : null
  const telHref = row.telephone && !mobile ? toTelHref(row.telephone) : null

  return (
    <tr className={`border-b border-zinc-800/60 transition-colors ${contactedAt ? "bg-zinc-900/40" : "hover:bg-zinc-900/60"}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={!!contactedAt}
          onChange={onToggleContacted}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-emerald-600"
          title={contactedAt ? `Contacté le ${new Date(contactedAt).toLocaleDateString("fr-BE")}` : "Marquer comme contacté"}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {row.goldStar && <span title="Cible en or">⭐</span>}
          <span className={`font-medium ${contactedAt ? "text-zinc-500" : "text-white"}`}>{row.nom}</span>
        </div>
        <div className="text-xs text-zinc-600 capitalize">{row.secteur}</div>
      </td>
      <td className="px-4 py-3 text-zinc-400">{row.ville}</td>
      <td className="px-4 py-3 text-zinc-400">{row.note ?? "—"}</td>
      <td className="px-4 py-3 text-zinc-400">{row.avis ?? "—"}</td>
      <td className="px-4 py-3">
        {row.siteWeb ? (
          <a
            href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline"
          >
            Voir
          </a>
        ) : (
          <span className="text-zinc-600">Aucun site</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-xs truncate text-zinc-400" title={row.angle ?? ""}>
        {row.angle ?? "—"}
      </td>
      <td className={`px-4 py-3 text-right font-bold ${SCORE_COLOR(row.score)}`}>{row.score}</td>
      <td className="px-4 py-3 text-right">
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
          >
            WhatsApp
          </a>
        ) : telHref ? (
          <a
            href={`tel:${telHref}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 transition-colors"
          >
            Appeler
          </a>
        ) : (
          <span className="text-xs text-zinc-600">Pas de tél.</span>
        )}
      </td>
    </tr>
  )
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
