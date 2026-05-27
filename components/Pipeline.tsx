"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core"
import type { Prospect } from "@prisma/client"
import { ScoreBadge } from "./ScoreBadge"
import { ProspectDetail } from "./ProspectDetail"

const COLONNES = [
  { id: "a_contacter", label: "À contacter" },
  { id: "contacte", label: "Contacté" },
  { id: "a_repondu", label: "A répondu" },
  { id: "rdv", label: "RDV" },
  { id: "signe", label: "Signé ✅" },
]

function ProspectCard({
  prospect,
  onClick,
}: {
  prospect: Prospect
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: prospect.id,
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0 : 1 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="cursor-pointer rounded-lg bg-zinc-800 p-3 shadow hover:bg-zinc-700 active:cursor-grabbing"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-white leading-tight">
          {prospect.goldStar && "⭐ "}
          {prospect.nom}
        </span>
        <ScoreBadge score={prospect.score} />
      </div>
      <p className="mb-1 text-xs text-zinc-400">{prospect.secteur}</p>
      {prospect.angle && (
        <p className="text-xs text-zinc-500 italic truncate">{prospect.angle}</p>
      )}
      {prospect.telephone && (
        <p className="mt-1 text-xs text-zinc-500">📞 {prospect.telephone}</p>
      )}
      <div className="mt-1.5 flex gap-1">
        {prospect.emailOuvert && (
          <span className="rounded-full bg-blue-900 px-1.5 py-0.5 text-[10px] text-blue-300">👁 Ouvert</span>
        )}
        {prospect.relancee && (
          <span className="rounded-full bg-purple-900 px-1.5 py-0.5 text-[10px] text-purple-300">↩ Relancé</span>
        )}
      </div>
    </div>
  )
}

function DroppableColumn({
  colonne,
  prospects,
  onCardClick,
}: {
  colonne: { id: string; label: string }
  prospects: Prospect[]
  onCardClick: (p: Prospect) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colonne.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[200px] flex-col rounded-xl border transition-colors ${
        isOver ? "border-indigo-500 bg-zinc-800/60" : "border-zinc-700 bg-zinc-900"
      }`}
    >
      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2.5">
        <span className="text-sm font-semibold text-zinc-200">{colonne.label}</span>
        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
          {prospects.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {prospects.map((p) => (
          <ProspectCard key={p.id} prospect={p} onClick={() => onCardClick(p)} />
        ))}
      </div>
    </div>
  )
}

export function Pipeline() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [search, setSearch] = useState("")
  const [secteurFilter, setSecteurFilter] = useState("")
  const [sortBy, setSortBy] = useState("score")
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [secteurs, setSecteurs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchSending, setBatchSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ count: number; errors: string[] } | null>(null)
  const [showSansEmail, setShowSansEmail] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const loadProspects = useCallback(async (s: string, sf: string, sb: string) => {
    const params = new URLSearchParams({ search: s, secteur: sf, sortBy: sb })
    const res = await fetch(`/api/prospects?${params}`)
    const data = await res.json()
    setProspects(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadProspects(search, secteurFilter, sortBy)
  }, [search, secteurFilter, sortBy, loadProspects])

  useEffect(() => {
    fetch("/api/secteurs")
      .then((r) => r.json())
      .then((d) => setSecteurs(d.secteurs ?? d))
  }, [])

  const handleDragStart = (e: DragStartEvent) => {
    setDraggingId(e.active.id as number)
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = e
    if (!over) return
    const newStatut = over.id as string
    const prospect = prospects.find((p) => p.id === active.id)
    if (!prospect || prospect.statut === newStatut) return

    setProspects((prev) =>
      prev.map((p) => (p.id === prospect.id ? { ...p, statut: newStatut } : p))
    )

    await fetch(`/api/prospects/${prospect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut: newStatut }),
    })
  }

  const draggingProspect = prospects.find((p) => p.id === draggingId)

  const stats = {
    total: prospects.length,
    chauds: prospects.filter((p) => p.score >= 50).length,
    signes: prospects.filter((p) => p.statut === "signe").length,
    sansEmail: prospects.filter((p) => !p.emailCorps).length,
    pretsEnvoyer: prospects.filter((p) => p.email && p.emailCorps && p.statut === "a_contacter").length,
  }

  const generateBatch = async () => {
    setBatchGenerating(true)
    await fetch("/api/email/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    await loadProspects(search, secteurFilter, sortBy)
    setBatchGenerating(false)
  }

  const sendBatch = async () => {
    if (!confirm(`Envoyer ${stats.pretsEnvoyer} email(s) maintenant via Brevo ?`)) return
    setBatchSending(true)
    setSendResult(null)

    const res = await fetch("/api/send-email/batch-stream", { method: "POST" })
    if (!res.body) { setBatchSending(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let count = 0

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
          if (evt.type === "sent" && evt.prospectId) {
            setProspects((prev) =>
              prev.map((p) => p.id === evt.prospectId ? { ...p, statut: "contacte" } : p)
            )
            count = evt.count
          }
          if (evt.type === "done") {
            setSendResult({ count: evt.count, errors: evt.errors ?? [] })
          }
        } catch {}
      }
    }
    setBatchSending(false)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-6 border-b border-zinc-800 px-6 py-3 text-sm">
        <span className="text-zinc-400">
          Total <span className="font-bold text-white">{stats.total}</span>
        </span>
        <span className="text-zinc-400">
          Chauds 🔥 <span className="font-bold text-orange-400">{stats.chauds}</span>
        </span>
        <span className="text-zinc-400">
          Signés ✅ <span className="font-bold text-emerald-400">{stats.signes}</span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {stats.sansEmail > 0 && (
            <button
              onClick={generateBatch}
              disabled={batchGenerating}
              className="rounded bg-indigo-700 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {batchGenerating
                ? "Génération en cours..."
                : `Générer emails (${stats.sansEmail} sans)`}
            </button>
          )}
          {stats.pretsEnvoyer > 0 && (
            <button
              onClick={sendBatch}
              disabled={batchSending}
              className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {batchSending
                ? "Envoi en cours..."
                : `📤 Envoyer ${stats.pretsEnvoyer} email(s)`}
            </button>
          )}
          {sendResult && (
            <span className="text-xs text-emerald-400">
              ✅ {sendResult.count} envoyé(s)
              {sendResult.errors.length > 0 && ` — ${sendResult.errors.length} erreur(s)`}
            </span>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={secteurFilter}
          onChange={(e) => setSecteurFilter(e.target.value)}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="score">Trier par score</option>
          <option value="date">Trier par date</option>
        </select>
        <button
          onClick={() => setShowSansEmail((v) => !v)}
          className={`ml-auto rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            showSansEmail
              ? "bg-amber-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          {showSansEmail ? "✕ Masquer sans email" : `⚠ Sans email (${prospects.filter((p) => !p.email).length})`}
        </button>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-zinc-500">
          Chargement...
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {showSansEmail ? (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              <p className="text-xs text-amber-400 font-medium mb-1">
                {prospects.filter((p) => !p.email).length} prospect(s) sans email — clique pour ajouter manuellement
              </p>
              <div className="grid grid-cols-3 gap-2">
                {prospects.filter((p) => !p.email).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="cursor-pointer rounded-lg bg-zinc-800 p-3 hover:bg-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-white leading-tight">
                        {p.goldStar && "⭐ "}{p.nom}
                      </span>
                      <ScoreBadge score={p.score} />
                    </div>
                    <p className="text-xs text-zinc-400">{p.secteur}</p>
                    {p.siteWeb && <p className="mt-1 text-xs text-zinc-500 truncate">🌐 {p.siteWeb}</p>}
                    {p.telephone && <p className="mt-1 text-xs text-zinc-500">📞 {p.telephone}</p>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 gap-4 overflow-x-auto p-4">
              {COLONNES.map((col) => (
                <div key={col.id} className="w-64 flex-none">
                  <DroppableColumn
                    colonne={col}
                    prospects={prospects.filter((p) => p.statut === col.id && p.email)}
                    onCardClick={(p) => setSelected(p)}
                  />
                </div>
              ))}
            </div>
          )}
          <DragOverlay>
            {draggingProspect && (
              <div className="w-64 rounded-lg bg-zinc-700 p-3 shadow-2xl opacity-90">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{draggingProspect.nom}</span>
                  <ScoreBadge score={draggingProspect.score} />
                </div>
                <p className="text-xs text-zinc-400">{draggingProspect.secteur}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Détail */}
      {selected && (
        <ProspectDetail
          prospect={selected}
          onClose={() => setSelected(null)}
          onUpdate={(updated) => {
            setProspects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            setSelected(updated)
          }}
          onDelete={(id) => {
            setProspects((prev) => prev.filter((p) => p.id !== id))
          }}
        />
      )}
    </div>
  )
}
