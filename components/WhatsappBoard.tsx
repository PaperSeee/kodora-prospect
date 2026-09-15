"use client"

import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react"
import { isMobileBe, whatsappUrl, toTelHref } from "@/lib/phone"
import { whatsappMessage, SECTEURS_PRIORITAIRES, SECTEURS_SECONDAIRES, SECTEURS_SANS_SITE } from "@/lib/pipeline-config"
import { matchesQuery, stripEmoji } from "@/lib/search"
import { ProspectPanel, type PanelRow } from "./ProspectPanel"

type Row = PanelRow

const VIEW_KEY = "whatsapp-board-view"
const PAGE = 100

// Cache en mémoire du module (survit tant que l'onglet du navigateur reste
// ouvert, y compris en changeant de page via next/link qui démonte ce
// composant). Sans ça, revenir sur /whatsapp remet `rows` à null et réaffiche
// "Chargement…" à chaque fois, alors que les données changent rarement d'une
// minute à l'autre. Au montage, la donnée en cache s'affiche immédiatement
// et un fetch se fait quand même en arrière-plan pour la rafraîchir.
let cacheRows: Row[] | null = null
let cacheCooldown = 90

type ViewMode = "file" | "tableau"
type Onglet = "a_contacter" | "contactes"
type CanalFilter = "" | "whatsapp" | "appeler"

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-red-600" : s >= 50 ? "text-orange-600" : s >= 30 ? "text-amber-600" : "text-gray-400"

// Canal effectif pour un prospect — même logique que le rendu des boutons
// (mobile BE → WhatsApp, fixe → Appeler, rien → aucun canal exploitable).
function canalDe(row: Row): CanalFilter | null {
  if (!row.telephone) return null
  return isMobileBe(row.telephone) ? "whatsapp" : "appeler"
}

function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// Niveau de priorité d'un secteur — voir pipeline-config.ts, rebranché sur
// les clics Search Console réels des sites leads (cockpit /perf).
type PrioriteNiveau = "forte" | "secondaire" | null
function prioriteDe(secteur: string): PrioriteNiveau {
  const s = secteur.toLowerCase().trim()
  if (SECTEURS_PRIORITAIRES.has(s)) return "forte"
  if (SECTEURS_SECONDAIRES.has(s)) return "secondaire"
  return null
}

export function WhatsappBoard() {
  const [rows, setRows] = useState<Row[] | null>(cacheRows)
  const [cooldownJours, setCooldownJours] = useState(cacheCooldown)
  // Écrase la valeur serveur le temps d'un aller-retour, pour que cocher
  // "contacté" soit instantané sans recharger les 2 500 lignes.
  const [overrides, setOverrides] = useState<Record<number, string | null>>({})
  const [onglet, setOnglet] = useState<Onglet>("a_contacter")
  const [query, setQuery] = useState("")
  const [communeFilter, setCommuneFilter] = useState("")
  const [secteurFilter, setSecteurFilter] = useState("")
  const [canalFilter, setCanalFilter] = useState<CanalFilter>("")
  const [view, setView] = useState<ViewMode>("file")
  const [cursor, setCursor] = useState(0)
  const [visibles, setVisibles] = useState(PAGE)
  const [selected, setSelected] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/whatsapp")
    const data = await res.json()
    cacheRows = data.rows
    cacheCooldown = data.cooldownJours
    setRows(data.rows)
    setCooldownJours(data.cooldownJours)
  }, [])

  useEffect(() => {
    load()
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === "file" || v === "tableau") setView(v)
    } catch {}
  }, [load])

  const setViewPersist = (v: ViewMode) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
  }

  // Appelé par chaque changement de filtre : remet la file au premier
  // prospect et la pagination à la première page. Fait ici, dans le
  // gestionnaire, plutôt que dans un effet qui réagirait après le rendu.
  const apresFiltre = useCallback(() => {
    setCursor(0)
    setVisibles(PAGE)
  }, [])

  const contactedAtDe = useCallback(
    (row: Row) => (row.id in overrides ? overrides[row.id] : row.contactedAt),
    [overrides]
  )

  const toggleContacted = useCallback(async (id: number) => {
    const row = rows?.find((r) => r.id === id)
    if (!row) return
    const dejaContacte = !!(id in overrides ? overrides[id] : row.contactedAt)
    setOverrides((prev) => ({ ...prev, [id]: dejaContacte ? null : new Date().toISOString() }))
    await fetch("/api/whatsapp/contacted", {
      method: dejaContacte ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: id }),
    }).catch(() => {})
  }, [rows, overrides])

  const communes = useMemo(() => [...new Set((rows ?? []).map((r) => r.ville))].sort(), [rows])
  const secteurs = useMemo(() => [...new Set((rows ?? []).map((r) => r.secteur))].sort(), [rows])

  // Répartition entre les deux onglets. "À contacter" garde le cooldown :
  // quelqu'un contacté il y a plus de 90 jours redevient contactable, tout
  // en restant visible dans l'onglet Contactés.
  const { aContacter, contactes } = useMemo(() => {
    const a: Row[] = []
    const c: Row[] = []
    for (const r of rows ?? []) {
      const at = contactedAtDe(r)
      if (at) {
        c.push(r)
        if (joursDepuis(at) >= cooldownJours) a.push(r)
      } else {
        a.push(r)
      }
    }
    c.sort((x, y) => (contactedAtDe(y) ?? "").localeCompare(contactedAtDe(x) ?? ""))
    return { aContacter: a, contactes: c }
  }, [rows, contactedAtDe, cooldownJours])

  const filtered = useMemo(() => {
    const base = onglet === "a_contacter" ? aContacter : contactes
    return base.filter((r) => {
      if (communeFilter && r.ville !== communeFilter) return false
      if (secteurFilter && r.secteur !== secteurFilter) return false
      if (canalFilter && canalDe(r) !== canalFilter) return false
      return matchesQuery(r, query)
    })
  }, [onglet, aContacter, contactes, communeFilter, secteurFilter, canalFilter, query])

  // Position dans la file dérivée plutôt que corrigée après coup : quand un
  // filtre raccourcit la liste, l'index courant peut la dépasser, et le
  // remettre à 0 dans un effet provoquerait un rendu en cascade.
  const cursorSafe = cursor < filtered.length ? cursor : 0

  const selectedRow = useMemo(
    () => (selected == null ? null : (rows ?? []).find((r) => r.id === selected) ?? null),
    [selected, rows]
  )

  if (!rows) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-400">Chargement…</div>
  }

  const reinitialiser = () => {
    setQuery(""); setCommuneFilter(""); setSecteurFilter(""); setCanalFilter(""); apresFiltre()
  }
  const filtreActif = !!(query || communeFilter || secteurFilter || canalFilter)

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Barre d'outils */}
      <div className="border-b border-gray-200 bg-white">
        {/* Onglets + vue */}
        <div className="flex items-center gap-1 px-6 pt-3">
          <Onglets
            valeur={onglet}
            onChange={(o) => { setOnglet(o); apresFiltre() }}
            nbAContacter={aContacter.length}
            nbContactes={contactes.length}
          />
          {onglet === "a_contacter" && (
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
              <BoutonVue actif={view === "file"} onClick={() => setViewPersist("file")}>File</BoutonVue>
              <BoutonVue actif={view === "tableau"} onClick={() => setViewPersist("tableau")}>Tableau</BoutonVue>
            </div>
          )}
        </div>

        {/* Recherche + filtres */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <div className="relative min-w-[260px] flex-1">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); apresFiltre() }}
              placeholder="Rechercher un nom, une commune, un numéro…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-900 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-sm text-gray-400 hover:text-gray-900"
              >
                ×
              </button>
            )}
          </div>

          <Select value={communeFilter} onChange={(v) => { setCommuneFilter(v); apresFiltre() }} vide="Toutes les communes" options={communes} />
          <Select
            value={secteurFilter}
            onChange={(v) => { setSecteurFilter(v); apresFiltre() }}
            vide="Tous les métiers"
            options={secteurs}
            capitalize
            optionLabel={(s) => {
              const p = prioriteDe(s)
              if (p === "forte") return `${s} ★★ (site performant)`
              if (p === "secondaire") return `${s} ★ (site en trafic)`
              if (SECTEURS_SANS_SITE.has(s.toLowerCase().trim())) return `${s} — pas de site pour recevoir les leads`
              return s
            }}
          />

          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5">
            <BoutonCanal actif={canalFilter === ""} onClick={() => { setCanalFilter(""); apresFiltre() }}>Tous</BoutonCanal>
            <BoutonCanal actif={canalFilter === "whatsapp"} onClick={() => { setCanalFilter("whatsapp"); apresFiltre() }}>WhatsApp</BoutonCanal>
            <BoutonCanal actif={canalFilter === "appeler"} onClick={() => { setCanalFilter("appeler"); apresFiltre() }}>Appel</BoutonCanal>
          </div>

          {filtreActif && (
            <button onClick={reinitialiser} className="text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline">
              Réinitialiser
            </button>
          )}
        </div>

        {/* Compteurs, en une ligne discrète */}
        <div className="flex items-center gap-3 px-6 pb-2.5 text-xs text-gray-500">
          <span className="tabular-nums">
            <strong className="font-semibold text-gray-900">{filtered.length.toLocaleString("fr-BE")}</strong>
            {filtreActif ? " résultats" : " prospects"}
          </span>
          <span className="text-gray-300">·</span>
          <span className="tabular-nums">{contactes.length.toLocaleString("fr-BE")} contactés</span>
          <span className="text-gray-300">·</span>
          <span>recontact possible après {cooldownJours} j</span>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-6">
        {onglet === "a_contacter" && view === "file" ? (
          <QueueView
            queue={filtered}
            cursor={cursorSafe}
            setCursor={setCursor}
            onContacted={toggleContacted}
            onOuvrirFiche={setSelected}
            panneauOuvert={selected != null}
          />
        ) : (
          <TableView
            rows={filtered.slice(0, visibles)}
            total={filtered.length}
            visibles={visibles}
            onVoirPlus={() => setVisibles((v) => v + PAGE)}
            contactedAtDe={contactedAtDe}
            onToggleContacted={toggleContacted}
            onOuvrirFiche={setSelected}
          />
        )}
      </div>

      {selectedRow && (
        <ProspectPanel
          key={selectedRow.id}
          row={{ ...selectedRow, contactedAt: contactedAtDe(selectedRow) }}
          onClose={() => setSelected(null)}
          onToggleContacted={toggleContacted}
        />
      )}
    </div>
  )
}

/* ── Éléments de la barre d'outils ─────────────────────────────────────── */

function Onglets({
  valeur, onChange, nbAContacter, nbContactes,
}: {
  valeur: Onglet
  onChange: (o: Onglet) => void
  nbAContacter: number
  nbContactes: number
}) {
  const item = (o: Onglet, label: string, n: number) => (
    <button
      onClick={() => onChange(o)}
      className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors ${
        valeur === o ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"
      }`}
    >
      {label} <span className="tabular-nums text-gray-400">{n.toLocaleString("fr-BE")}</span>
    </button>
  )
  return (
    <div className="flex items-center gap-5">
      {item("a_contacter", "À contacter", nbAContacter)}
      {item("contactes", "Contactés", nbContactes)}
    </div>
  )
}

function Select({
  value, onChange, vide, options, capitalize, optionLabel,
}: {
  value: string
  onChange: (v: string) => void
  vide: string
  options: string[]
  capitalize?: boolean
  optionLabel?: (o: string) => string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-700 transition-colors focus:border-gray-900 focus:outline-none ${capitalize ? "capitalize" : ""}`}
    >
      <option value="">{vide}</option>
      {options.map((o) => <option key={o} value={o}>{optionLabel ? optionLabel(o) : o}</option>)}
    </select>
  )
}

function BoutonCanal({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        actif ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  )
}

// Signale un secteur dont le site lead correspondant performe réellement
// (clics Search Console, voir pipeline-config.ts) — pas un jugement sur le
// prospect lui-même, sur le canal qui le reçoit une fois signé.
function PrioriteBadge({ secteur }: { secteur: string }) {
  const p = prioriteDe(secteur)
  if (p === "forte") {
    return (
      <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-800" title="Site lead en forte performance (clics Search Console)">
        ★★ site performant
      </span>
    )
  }
  if (p === "secondaire") {
    return (
      <span className="shrink-0 rounded border border-sky-200 bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-800" title="Site lead avec du trafic mesuré (clics Search Console)">
        ★ site en trafic
      </span>
    )
  }
  return null
}

function BoutonVue({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        actif ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  )
}

/* ── Vue file : un prospect à la fois, contact en deux clics ────────────── */

function QueueView({
  queue, cursor, setCursor, onContacted, onOuvrirFiche, panneauOuvert,
}: {
  queue: Row[]
  cursor: number
  setCursor: (updater: (c: number) => number) => void
  onContacted: (id: number) => void
  onOuvrirFiche: (id: number) => void
  panneauOuvert: boolean
}) {
  const row = queue[cursor]

  const passer = useCallback(() => {
    setCursor((c) => (c + 1 < queue.length ? c + 1 : c))
  }, [queue.length, setCursor])

  const confirmerContact = useCallback(() => {
    if (!row) return
    onContacted(row.id)
    // Pas d'avance auto : la ligne sort de `queue`, l'élément suivant glisse
    // tout seul à la même position `cursor` — avancer sauterait un prospect.
  }, [row, onContacted])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (panneauOuvert) return
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === "Space") { e.preventDefault(); confirmerContact() }
      if (e.key === "ArrowRight") passer()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmerContact, passer, panneauOuvert])

  if (!row) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
        <p className="text-sm font-medium text-gray-900">Aucun prospect dans la file.</p>
        <p className="mt-1 text-sm text-gray-500">Change les filtres, ou reviens quand de nouveaux prospects auront été sourcés.</p>
      </div>
    )
  }

  const mobile = isMobileBe(row.telephone)
  const message = whatsappMessage(row.secteur, row.ville)
  const waUrl = row.telephone && mobile ? whatsappUrl(row.telephone, message) : null
  const telHref = row.telephone && !mobile ? toTelHref(row.telephone) : null

  return (
    <div className="mx-auto max-w-3xl space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="tabular-nums">{cursor + 1} sur {queue.length}</span>
        <span>Espace : marquer contacté · Flèche droite : passer</span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={() => onOuvrirFiche(row.id)}
              className="text-left text-xl font-semibold text-gray-900 underline-offset-4 hover:underline"
            >
              {stripEmoji(row.nom)}
            </button>
            <p className="mt-0.5 text-sm text-gray-500">
              <span className="capitalize">{row.secteur}</span> · {row.ville}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PrioriteBadge secteur={row.secteur} />
            {row.goldStar && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                Cible en or
              </span>
            )}
            <span className={`text-xl font-semibold tabular-nums ${SCORE_COLOR(row.score)}`}>{row.score}</span>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-gray-100 py-4 sm:grid-cols-4">
          <Stat label="Note" value={row.note ?? "—"} />
          <Stat label="Avis" value={row.avis ?? "—"} />
          <Stat label="Téléphone" value={row.telephone ?? "—"} />
          <Stat
            label="Site"
            value={row.siteWeb ? (
              <a href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                Ouvrir
              </a>
            ) : "Aucun"}
          />
        </dl>

        {row.angle && <p className="mt-4 text-sm text-gray-700">{stripEmoji(row.angle)}</p>}

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Message envoyé</p>
          <p className="whitespace-pre-line text-sm text-gray-700">{message}</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-500">
              Ouvrir WhatsApp
            </a>
          ) : telHref ? (
            <a href={`tel:${telHref}`} className="rounded-lg bg-gray-900 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-gray-700">
              Appeler
            </a>
          ) : (
            <span className="rounded-lg border border-dashed border-gray-300 py-3 text-center text-sm text-gray-400">
              Pas de numéro exploitable
            </span>
          )}
          <button
            onClick={confirmerContact}
            className="rounded-lg border border-gray-900 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
          >
            Marquer contacté
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => onOuvrirFiche(row.id)} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            Voir la fiche
          </button>
          <button onClick={passer} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            Passer sans contacter
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  )
}

/* ── Vue tableau ────────────────────────────────────────────────────────── */

function TableView({
  rows, total, visibles, onVoirPlus, contactedAtDe, onToggleContacted, onOuvrirFiche,
}: {
  rows: Row[]
  total: number
  visibles: number
  onVoirPlus: () => void
  contactedAtDe: (r: Row) => string | null
  onToggleContacted: (id: number) => void
  onOuvrirFiche: (id: number) => void
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <th className="w-10 px-4 py-2.5"></th>
              <th className="px-4 py-2.5 font-semibold">Nom</th>
              <th className="px-4 py-2.5 font-semibold">Commune</th>
              <th className="px-4 py-2.5 font-semibold">Téléphone</th>
              <th className="px-4 py-2.5 font-semibold">Avis</th>
              <th className="px-4 py-2.5 font-semibold">Défaut détecté</th>
              <th className="px-4 py-2.5 text-right font-semibold">Score</th>
              <th className="px-4 py-2.5 text-right font-semibold">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ProspectRow
                key={r.id}
                row={r}
                contactedAt={contactedAtDe(r)}
                onToggleContacted={() => onToggleContacted(r.id)}
                onOuvrirFiche={() => onOuvrirFiche(r.id)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  Aucun prospect ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {visibles < total && (
        <button
          onClick={onVoirPlus}
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Voir plus — {visibles.toLocaleString("fr-BE")} sur {total.toLocaleString("fr-BE")}
        </button>
      )}
    </div>
  )
}

function ProspectRow({
  row, contactedAt, onToggleContacted, onOuvrirFiche,
}: {
  row: Row
  contactedAt: string | null
  onToggleContacted: () => void
  onOuvrirFiche: () => void
}) {
  const mobile = isMobileBe(row.telephone)
  const message = whatsappMessage(row.secteur, row.ville)
  const waUrl = row.telephone && mobile ? whatsappUrl(row.telephone, message) : null
  const telHref = row.telephone && !mobile ? toTelHref(row.telephone) : null

  return (
    <tr
      onClick={onOuvrirFiche}
      className="cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
    >
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!contactedAt}
          onChange={onToggleContacted}
          className="h-4 w-4 rounded border-gray-300 accent-gray-900"
          title={contactedAt ? `Contacté le ${new Date(contactedAt).toLocaleDateString("fr-BE")}` : "Marquer comme contacté"}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-900">{stripEmoji(row.nom)}</span>
          <PrioriteBadge secteur={row.secteur} />
          {row.goldStar && (
            <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800">
              Or
            </span>
          )}
        </div>
        <div className="text-xs capitalize text-gray-400">
          {row.secteur}
          {contactedAt && <span className="text-gray-400"> · contacté il y a {joursDepuis(contactedAt)} j</span>}
        </div>
      </td>
      <td className="px-4 py-2.5 text-gray-600">{row.ville}</td>
      <td className="px-4 py-2.5 tabular-nums text-gray-600">{row.telephone ?? "—"}</td>
      <td className="px-4 py-2.5 tabular-nums text-gray-600">
        {row.avis ?? "—"}
        {row.note != null && <span className="text-gray-400"> · {row.note}</span>}
      </td>
      <td className="max-w-xs truncate px-4 py-2.5 text-gray-600" title={row.angle ? stripEmoji(row.angle) : ""}>
        {row.angle ? stripEmoji(row.angle) : "—"}
      </td>
      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${SCORE_COLOR(row.score)}`}>{row.score}</td>
      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-500">
            WhatsApp
          </a>
        ) : telHref ? (
          <a href={`tel:${telHref}`} className="inline-flex rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-700">
            Appeler
          </a>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
    </tr>
  )
}
