"use client"

import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react"
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
const VIEW_KEY = "whatsapp-board-view"

type LocalContacted = Record<number, string> // prospectId -> ISO date
type ViewMode = "file" | "tableau"

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
  const [view, setView] = useState<ViewMode>("file")
  const [cursor, setCursor] = useState(0)
  const [justSent, setJustSent] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    const res = await fetch("/api/whatsapp")
    const data = await res.json()
    setRows(data.rows)
    setCooldownJours(data.cooldownJours)
  }, [])

  useEffect(() => {
    load()
    setContacted(loadLocalContacted())
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === "file" || v === "tableau") setView(v)
    } catch {}
  }, [load])

  const setViewPersist = (v: ViewMode) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  const markContacted = useCallback(async (id: number) => {
    const now = new Date().toISOString()
    setContacted((prev) => {
      const next = { ...prev, [id]: now }
      saveLocalContacted(next)
      return next
    })
    await fetch("/api/whatsapp/contacted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: id }),
    })
  }, [])

  const unmarkContacted = useCallback(async (id: number) => {
    setContacted((prev) => {
      const next = { ...prev }
      delete next[id]
      saveLocalContacted(next)
      return next
    })
    await fetch("/api/whatsapp/contacted", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: id }),
    })
  }, [])

  const toggleContacted = (id: number) => {
    if (contacted[id]) unmarkContacted(id)
    else markContacted(id)
  }

  const communes = useMemo(() => [...new Set((rows ?? []).map((r) => r.ville))].sort(), [rows])
  const secteurs = useMemo(() => [...new Set((rows ?? []).map((r) => r.secteur))].sort(), [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (communeFilter && r.ville !== communeFilter) return false
      if (secteurFilter && r.secteur !== secteurFilter) return false
      return true
    })
  }, [rows, communeFilter, secteurFilter])

  // File d'attente : tout ce qui n'est pas déjà coché "contacté" (ni en base,
  // via /api/whatsapp qui exclut déjà le cooldown 90j, ni localement dans
  // cette session), dans l'ordre score décroissant déjà fourni par l'API.
  const queue = useMemo(() => filtered.filter((r) => !contacted[r.id]), [filtered, contacted])

  useEffect(() => {
    if (cursor >= queue.length && queue.length > 0) setCursor(0)
  }, [queue.length, cursor])

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

      {/* Filtres + toggle de vue */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <select
          value={communeFilter}
          onChange={(e) => { setCommuneFilter(e.target.value); setCursor(0) }}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-600 focus:outline-none"
        >
          <option value="">Toutes les communes</option>
          {communes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={secteurFilter}
          onChange={(e) => { setSecteurFilter(e.target.value); setCursor(0) }}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 capitalize focus:border-emerald-600 focus:outline-none"
        >
          <option value="">Tous les métiers</option>
          {secteurs.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          <button
            onClick={() => setViewPersist("file")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "file" ? "bg-emerald-700 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            ⚡ File
          </button>
          <button
            onClick={() => setViewPersist("tableau")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "tableau" ? "bg-emerald-700 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            ☰ Tableau
          </button>
        </div>

        <span className="w-full text-xs text-zinc-600">
          Exclut par défaut les prospects contactés il y a moins de {cooldownJours} jours
        </span>
      </div>

      {view === "file" ? (
        <QueueView
          queue={queue}
          cursor={cursor}
          setCursor={setCursor}
          onContacted={(id) => { markContacted(id) }}
          justSent={justSent}
          setJustSent={setJustSent}
        />
      ) : (
        <TableView filtered={filtered} contacted={contacted} onToggleContacted={toggleContacted} />
      )}
    </div>
  )
}

// ── Vue file d'attente : 1 prospect à la fois, contact en 2 clics max ──
function QueueView({
  queue,
  cursor,
  setCursor,
  onContacted,
  justSent,
  setJustSent,
}: {
  queue: Row[]
  cursor: number
  setCursor: (updater: (c: number) => number) => void
  onContacted: (id: number) => void
  justSent: Set<number>
  setJustSent: (updater: (s: Set<number>) => Set<number>) => void
}) {
  const row = queue[cursor]

  const passer = useCallback(() => {
    setCursor((c) => (c + 1 < queue.length ? c + 1 : c))
  }, [queue.length, setCursor])

  const confirmerContact = useCallback(() => {
    if (!row) return
    onContacted(row.id)
    // Pas d'avance auto sur l'index : la ligne sort de `queue` (filtrée sur
    // !contacted), donc l'élément suivant glisse automatiquement à la même
    // position `cursor` — avancer nous-mêmes sauterait un prospect.
  }, [row, onContacted])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return
      if (e.code === "Space") { e.preventDefault(); confirmerContact() }
      if (e.key === "ArrowRight") passer()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmerContact, passer])

  if (!row) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 py-24 text-center">
        <span className="text-4xl">🎉</span>
        <p className="text-lg font-semibold text-white">File vide — tout le monde a été contacté.</p>
        <p className="text-sm text-zinc-500">Change les filtres ou repasse plus tard pour de nouveaux prospects.</p>
      </div>
    )
  }

  const mobile = isMobileBe(row.telephone)
  const message = whatsappMessage(row.secteur, row.ville)
  const waUrl = row.telephone && mobile ? whatsappUrl(row.telephone, message) : null
  const telHref = row.telephone && !mobile ? toTelHref(row.telephone) : null

  const openContact = () => {
    setJustSent((s) => new Set(s).add(row.id))
    if (waUrl) window.open(waUrl, "_blank", "noopener")
    else if (telHref) window.location.href = `tel:${telHref}`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{cursor + 1} / {queue.length} dans la file</span>
        <span>Espace = marquer contacté · → = passer</span>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {row.goldStar && <span className="text-xl" title="Cible en or">⭐</span>}
              <h2 className="text-2xl font-bold text-white">{row.nom}</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-400 capitalize">{row.secteur} · {row.ville}</p>
          </div>
          <span className={`shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-lg font-bold ${SCORE_COLOR(row.score)}`}>
            {row.score}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Note" value={row.note ?? "—"} />
          <Stat label="Avis" value={row.avis ?? "—"} />
          <Stat label="Téléphone" value={row.telephone ?? "—"} />
          <Stat
            label="Site"
            value={
              row.siteWeb ? (
                <a href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  Voir
                </a>
              ) : "Aucun"
            }
          />
        </div>

        {row.angle && (
          <p className="mt-4 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-400">
            {row.angle}
          </p>
        )}

        <div className="mt-5 rounded-lg border border-zinc-800 bg-black/30 px-4 py-3 text-sm text-zinc-300">
          <p className="mb-1 text-xs uppercase tracking-wider text-zinc-600">Message qui sera envoyé</p>
          {message}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {waUrl ? (
            <button
              onClick={openContact}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500 transition-colors"
            >
              💬 Ouvrir WhatsApp
            </button>
          ) : telHref ? (
            <button
              onClick={openContact}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-lg shadow-indigo-950/50 hover:bg-indigo-500 transition-colors"
            >
              📞 Appeler
            </button>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-700 py-4 text-sm text-zinc-600">
              Pas de téléphone exploitable
            </div>
          )}

          <button
            onClick={confirmerContact}
            className={`flex items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition-colors ${
              justSent.has(row.id)
                ? "bg-emerald-800 text-emerald-100"
                : "bg-zinc-800 text-white hover:bg-zinc-700"
            }`}
          >
            ✓ Marquer contacté {justSent.has(row.id) ? "" : "(Espace)"}
          </button>
        </div>

        <button
          onClick={passer}
          className="mt-3 w-full rounded-lg py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Passer sans contacter →
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="text-sm font-semibold text-zinc-200">{value}</p>
    </div>
  )
}

// ── Vue tableau : vue d'ensemble dense ──
function TableView({
  filtered,
  contacted,
  onToggleContacted,
}: {
  filtered: Row[]
  contacted: LocalContacted
  onToggleContacted: (id: number) => void
}) {
  return (
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
            <ProspectRow key={r.id} row={r} contactedAt={contacted[r.id] ?? null} onToggleContacted={() => onToggleContacted(r.id)} />
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
          <a href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
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
          <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors">
            WhatsApp
          </a>
        ) : telHref ? (
          <a href={`tel:${telHref}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 transition-colors">
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
