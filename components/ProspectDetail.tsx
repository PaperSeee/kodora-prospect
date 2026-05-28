"use client"

import { useState, useCallback } from "react"
import type { Prospect } from "@/lib/types"
import { ScoreBadge } from "./ScoreBadge"
import { DiagnosticBadges } from "./DiagnosticBadges"

interface Props {
  prospect: Prospect
  onClose: () => void
  onUpdate: (updated: Prospect) => void
  onDelete: (id: number) => void
}

export function ProspectDetail({ prospect, onClose, onUpdate, onDelete }: Props) {
  const [notes, setNotes] = useState(prospect.notes ?? "")
  const [emailDest, setEmailDest] = useState(prospect.email ?? "")
  const [emailObjet, setEmailObjet] = useState(prospect.emailObjet ?? "")
  const [emailCorps, setEmailCorps] = useState(prospect.emailCorps ?? "")
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<"ok" | "err" | null>(null)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  let diagData = { flags: [] as string[] }
  try { diagData = prospect.diagnostic ? JSON.parse(prospect.diagnostic) : { flags: [] } } catch {}
  const flags = diagData.flags ?? []

  const saveField = useCallback(
    async (field: string, value: string) => {
      const res = await fetch(`/api/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      const updated = await res.json()
      onUpdate(updated)
    },
    [prospect.id, onUpdate]
  )

  // Debounce notes save
  let notesTimer: ReturnType<typeof setTimeout>
  const handleNotes = (val: string) => {
    setNotes(val)
    clearTimeout(notesTimer)
    notesTimer = setTimeout(() => saveField("notes", val), 800)
  }

  const generateEmail = async () => {
    setGenerating(true)
    const res = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: prospect.id }),
    })
    const data = await res.json()
    if (res.ok && data.objet) {
      setEmailObjet(data.objet)
      setEmailCorps(data.corps)
      onUpdate({ ...prospect, emailObjet: data.objet, emailCorps: data.corps })
    }
    setGenerating(false)
  }

  const copyEmail = () => {
    navigator.clipboard.writeText(`Objet : ${emailObjet}\n\n${emailCorps}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendEmail = async () => {
    if (!emailDest) return
    setSending(true)
    setSendResult(null)
    // Sauvegarder l'email de destination d'abord
    await saveField("email", emailDest)
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: prospect.id }),
    })
    setSendResult(res.ok ? "ok" : "err")
    if (res.ok) onUpdate({ ...prospect, statut: "contacte" })
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-xl overflow-y-auto bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            onClick={async () => {
              if (!confirm(`Supprimer ${prospect.nom} ?`)) return
              setDeleting(true)
              await fetch(`/api/prospects/${prospect.id}`, { method: "DELETE" })
              onDelete(prospect.id)
              onClose()
            }}
            disabled={deleting}
            className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/40 hover:text-red-300 disabled:opacity-50"
          >
            {deleting ? "..." : "Supprimer"}
          </button>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl">
            ✕
          </button>
        </div>

        {/* En-tête */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              {prospect.goldStar && "⭐ "}
              {prospect.nom}
            </h2>
            <p className="text-sm text-zinc-400">
              {prospect.secteur} · {prospect.ville}
            </p>
          </div>
          <ScoreBadge score={prospect.score} />
        </div>

        {/* Coordonnées */}
        <div className="mb-4 rounded-lg bg-zinc-800 p-3 text-sm">
          {prospect.telephone && (
            <div className="mb-1 flex items-center gap-2 text-zinc-300">
              <span>📞</span>
              <a href={`tel:${prospect.telephone}`} className="hover:text-white">
                {prospect.telephone}
              </a>
            </div>
          )}
          {prospect.siteWeb && (
            <div className="flex items-center gap-2 text-zinc-300">
              <span>🌐</span>
              <a
                href={prospect.siteWeb}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:text-white"
              >
                {prospect.siteWeb}
              </a>
            </div>
          )}
          {prospect.note && (
            <div className="mt-1 text-zinc-400 text-xs">
              ⭐ {prospect.note} / 5 · {prospect.avis} avis
            </div>
          )}
        </div>

        {/* Diagnostic */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Diagnostic
          </h3>
          {flags.length > 0 ? (
            <DiagnosticBadges flags={flags} />
          ) : (
            <p className="text-xs text-zinc-500">Aucun problème détecté</p>
          )}
          {prospect.angle && (
            <p className="mt-2 text-sm text-zinc-300 italic">"{prospect.angle}"</p>
          )}
        </div>

        {/* Email */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Email de prospection
            </h3>
            <div className="flex gap-2">
              <button
                onClick={generateEmail}
                disabled={generating}
                className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {generating ? "Génération..." : emailCorps ? "Régénérer" : "Générer"}
              </button>
              {emailCorps && (
                <button
                  onClick={copyEmail}
                  className="rounded bg-zinc-700 px-3 py-1 text-xs text-white hover:bg-zinc-600"
                >
                  {copied ? "Copié !" : "Copier"}
                </button>
              )}
            </div>
          </div>

          {/* Adresse email de destination */}
          <div className="mb-2 flex gap-2">
            <input
              value={emailDest}
              onChange={(e) => {
                setEmailDest(e.target.value)
                saveField("email", e.target.value)
              }}
              placeholder="Email du prospect (ex: cabinet@avocat.be)"
              type="email"
              className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {emailCorps && emailDest && (
              <button
                onClick={sendEmail}
                disabled={sending}
                className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 whitespace-nowrap"
              >
                {sending ? "Envoi..." : sendResult === "ok" ? "✅ Envoyé !" : sendResult === "err" ? "❌ Erreur" : "📤 Envoyer"}
              </button>
            )}
          </div>

          {emailCorps && (
            <div className="space-y-2">
              <input
                value={emailObjet}
                onChange={(e) => {
                  setEmailObjet(e.target.value)
                  saveField("emailObjet", e.target.value)
                }}
                placeholder="Objet"
                className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <textarea
                value={emailCorps}
                onChange={(e) => {
                  setEmailCorps(e.target.value)
                  saveField("emailCorps", e.target.value)
                }}
                rows={10}
                className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Notes personnelles
          </h3>
          <textarea
            value={notes}
            onChange={(e) => handleNotes(e.target.value)}
            placeholder="Ajouter une note... (sauvegarde automatique)"
            rows={4}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* WhatsApp link */}
        {prospect.telephone && (
          <a
            href={`https://wa.me/${prospect.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Bonjour ${prospect.nom}, je suis Ilias de Kodora. J'ai vu que ${prospect.angle ?? "votre présence en ligne pourrait être améliorée"}. Auriez-vous quelques minutes pour en discuter ?`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
            Envoyer via WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
