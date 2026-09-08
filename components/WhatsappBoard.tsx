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
type CanalFilter = "" | "whatsapp" | "appeler"

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
  s >= 70 ? "text-red-600" : s >= 50 ? "text-orange-600" : s >= 30 ? "text-amber-600" : "text-gray-400"

// Canal effectif pour un prospect — même logique que le rendu des boutons
// (mobile BE → WhatsApp, fixe → Appeler, rien → aucun canal exploitable).
function canalDe(row: Row): CanalFilter | null {
  if (!row.telephone) return null
  return isMobileBe(row.telephone) ? "whatsapp" : "appeler"
}

export function WhatsappBoard() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cooldownJours, setCooldownJours] = useState(90)
  const [contacted, setContacted] = useState<LocalContacted>({})
  const [communeFilter, setCommuneFilter] = useState("")
  const [secteurFilter, setSecteurFilter] = useState("")
  const [canalFilter, setCanalFilter] = useState<CanalFilter>("")
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
      if (canalFilter && canalDe(r) !== canalFilter) return false
      return true
    })
  }, [rows, communeFilter, secteurFilter, canalFilter])

  // File d'attente : tout ce qui n'est pas déjà coché "contacté" (ni en base,
  // via /api/whatsapp qui exclut déjà le cooldown 90j, ni localement dans
  // cette session), dans l'ordre score décroissant déjà fourni par l'API.
  const queue = useMemo(() => filtered.filter((r) => !contacted[r.id]), [filtered, contacted])

  useEffect(() => {
    if (cursor >= queue.length && queue.length > 0) setCursor(0)
  }, [queue.length, cursor])

  if (!rows) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        Chargement du tableau WhatsApp...
      </div>
    )
  }

  const totalContactes = rows.filter((r) => contacted[r.id]).length
  const totalRestants = rows.length - totalContactes

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 space-y-5">
      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-4">
        <CounterCard label="Total" value={rows.length} color="text-gray-900" />
        <CounterCard label="Contactés" value={totalContactes} color="text-emerald-600" />
        <CounterCard label="Restants" value={totalRestants} color="text-orange-600" />
      </div>

      {/* Filtres + toggle de vue */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <select
          value={communeFilter}
          onChange={(e) => { setCommuneFilter(e.target.value); setCursor(0) }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Toutes les communes</option>
          {communes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={secteurFilter}
          onChange={(e) => { setSecteurFilter(e.target.value); setCursor(0) }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 capitalize focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Tous les métiers</option>
          {secteurs.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>

        {/* Filtre canal : WhatsApp (mobile BE) vs Appeler (fixe) */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
          <CanalButton active={canalFilter === ""} onClick={() => { setCanalFilter(""); setCursor(0) }}>
            Tous
          </CanalButton>
          <CanalButton active={canalFilter === "whatsapp"} onClick={() => { setCanalFilter("whatsapp"); setCursor(0) }}>
            💬 WhatsApp
          </CanalButton>
          <CanalButton active={canalFilter === "appeler"} onClick={() => { setCanalFilter("appeler"); setCursor(0) }}>
            📞 Appeler
          </CanalButton>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
          <button
            onClick={() => setViewPersist("file")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "file" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-900"}`}
          >
            ⚡ File
          </button>
          <button
            onClick={() => setViewPersist("tableau")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "tableau" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-900"}`}
          >
            ☰ Tableau
          </button>
        </div>

        <span className="w-full text-xs text-gray-400">
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

function CanalButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
    >
      {children}
    </button>
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-24 text-center shadow-sm">
        <span className="text-4xl">🎉</span>
        <p className="text-lg font-semibold text-gray-900">File vide — tout le monde a été contacté.</p>
        <p className="text-sm text-gray-500">Change les filtres ou repasse plus tard pour de nouveaux prospects.</p>
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
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{cursor + 1} / {queue.length} dans la file</span>
        <span>Espace = marquer contacté · → = passer</span>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {row.goldStar && <span className="text-xl" title="Cible en or">⭐</span>}
              <h2 className="text-2xl font-bold text-gray-900">{row.nom}</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500 capitalize">{row.secteur} · {row.ville}</p>
          </div>
          <span className={`shrink-0 rounded-full bg-gray-100 px-3 py-1 text-lg font-bold ${SCORE_COLOR(row.score)}`}>
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
                <a href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                  Voir
                </a>
              ) : "Aucun"
            }
          />
        </div>

        {row.angle && (
          <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            {row.angle}
          </p>
        )}

        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <p className="mb-1 text-xs uppercase tracking-wider text-gray-400">Message qui sera envoyé</p>
          {message}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {waUrl ? (
            <button
              onClick={openContact}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white shadow-md hover:bg-emerald-500 transition-colors"
            >
              💬 Ouvrir WhatsApp
            </button>
          ) : telHref ? (
            <button
              onClick={openContact}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-md hover:bg-indigo-500 transition-colors"
            >
              📞 Appeler
            </button>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 py-4 text-sm text-gray-400">
              Pas de téléphone exploitable
            </div>
          )}

          <button
            onClick={confirmerContact}
            className={`flex items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold transition-colors ${
              justSent.has(row.id)
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-900 text-white hover:bg-gray-800"
            }`}
          >
            ✓ Marquer contacté {justSent.has(row.id) ? "" : "(Espace)"}
          </button>
        </div>

        <button
          onClick={passer}
          className="mt-3 w-full rounded-lg py-2 text-sm text-gray-400 hover:text-gray-700 transition-colors"
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
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
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
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
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
              <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
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
    <tr className={`border-b border-gray-100 transition-colors ${contactedAt ? "bg-gray-50" : "hover:bg-gray-50"}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={!!contactedAt}
          onChange={onToggleContacted}
          className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
          title={contactedAt ? `Contacté le ${new Date(contactedAt).toLocaleDateString("fr-BE")}` : "Marquer comme contacté"}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {row.goldStar && <span title="Cible en or">⭐</span>}
          <span className={`font-medium ${contactedAt ? "text-gray-400" : "text-gray-900"}`}>{row.nom}</span>
        </div>
        <div className="text-xs text-gray-400 capitalize">{row.secteur}</div>
      </td>
      <td className="px-4 py-3 text-gray-600">{row.ville}</td>
      <td className="px-4 py-3 text-gray-600">{row.note ?? "—"}</td>
      <td className="px-4 py-3 text-gray-600">{row.avis ?? "—"}</td>
      <td className="px-4 py-3">
        {row.siteWeb ? (
          <a href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
            Voir
          </a>
        ) : (
          <span className="text-gray-400">Aucun site</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-xs truncate text-gray-600" title={row.angle ?? ""}>
        {row.angle ?? "—"}
      </td>
      <td className={`px-4 py-3 text-right font-bold ${SCORE_COLOR(row.score)}`}>{row.score}</td>
      <td className="px-4 py-3 text-right">
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors">
            WhatsApp
          </a>
        ) : telHref ? (
          <a href={`tel:${telHref}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
            Appeler
          </a>
        ) : (
          <span className="text-xs text-gray-400">Pas de tél.</span>
        )}
      </td>
    </tr>
  )
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
