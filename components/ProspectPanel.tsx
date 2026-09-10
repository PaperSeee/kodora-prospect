"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { isMobileBe, whatsappUrl, toTelHref } from "@/lib/phone"
import { whatsappMessage } from "@/lib/pipeline-config"
import { stripEmoji } from "@/lib/search"
import { DiagnosticBadges } from "./DiagnosticBadges"
import type { DiagnosticFlag } from "@/lib/diagnose"

// Fiche prospect ouverte au clic depuis le tableau WhatsApp.
//
// Raison d'être : quand un prospect rappelle, retrouver en un coup d'œil qui
// il est, ce qu'on lui a dit et quand. Le panneau s'affiche immédiatement
// avec ce que la liste connaît déjà, puis se complète avec la fiche serveur
// (email, notes, diagnostic, audit) — pas d'écran de chargement vide.

export interface PanelRow {
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
  statut: string
  contactedAt: string | null
}

interface FicheComplete {
  email: string | null
  notes: string | null
  diagnostic: string | null
  statut: string
  createdAt: string
  rdvAt: string | null
  whatsappContact: { contactedAt: string } | null
  audits: { publicSlug: string; score: number; generatedAt: string; viewCount: number }[]
}

const STATUT_LABEL: Record<string, string> = {
  a_contacter: "À contacter",
  en_file: "En file",
  contacte: "Contacté",
  lead_chaud: "Lead chaud",
  rdv: "Rendez-vous",
  ecarte: "Écarté",
  desabonne: "Désabonné",
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" })
}

function joursDepuis(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function hostDe(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function ProspectPanel({
  row,
  onClose,
  onToggleContacted,
}: {
  row: PanelRow
  onClose: () => void
  onToggleContacted: (id: number) => void
}) {
  const [fiche, setFiche] = useState<FicheComplete | null>(null)
  const [notes, setNotes] = useState("")
  const [notesEtat, setNotesEtat] = useState<"vierge" | "en_cours" | "enregistre">("vierge")
  const [copie, setCopie] = useState<"tel" | "email" | null>(null)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Le parent monte ce composant avec key={prospect.id} : changer de fiche
  // remonte le panneau, donc pas d'état résiduel à réinitialiser ici.
  useEffect(() => {
    let annule = false
    fetch(`/api/prospects/${row.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FicheComplete | null) => {
        if (annule || !data) return
        setFiche(data)
        setNotes(data.notes ?? "")
      })
      .catch(() => {})
    return () => { annule = true }
  }, [row.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Nettoyage du minuteur au démontage : sans ça, fermer la fiche juste après
  // avoir tapé une note déclenche un PATCH sur un composant démonté.
  useEffect(() => () => { if (notesTimer.current) clearTimeout(notesTimer.current) }, [])

  const majNotes = useCallback((valeur: string) => {
    setNotes(valeur)
    setNotesEtat("en_cours")
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await fetch(`/api/prospects/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: valeur }),
      }).catch(() => {})
      setNotesEtat("enregistre")
    }, 700)
  }, [row.id])

  const copier = (valeur: string, quoi: "tel" | "email") => {
    navigator.clipboard.writeText(valeur).then(() => {
      setCopie(quoi)
      setTimeout(() => setCopie(null), 1500)
    }).catch(() => {})
  }

  let flags: DiagnosticFlag[] = []
  try {
    flags = fiche?.diagnostic ? (JSON.parse(fiche.diagnostic).flags ?? []) : []
  } catch {}

  const mobile = isMobileBe(row.telephone)
  const message = whatsappMessage(row.secteur, row.ville)
  const waUrl = row.telephone && mobile ? whatsappUrl(row.telephone, message) : null
  const telHref = row.telephone ? toTelHref(row.telephone) : null
  const contactedAt = fiche?.whatsappContact?.contactedAt ?? row.contactedAt
  const jours = joursDepuis(contactedAt)
  const statut = fiche?.statut ?? row.statut
  const audit = fiche?.audits?.[0] ?? null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <header className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-900">{stripEmoji(row.nom)}</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                <span className="capitalize">{row.secteur}</span> · {row.ville}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="-mr-1 -mt-1 rounded px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              Fermer
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-700">
              Score {row.score}
            </span>
            {row.goldStar && (
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                Cible en or
              </span>
            )}
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
              {STATUT_LABEL[statut] ?? statut}
            </span>
            {contactedAt && (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Contacté il y a {jours} j
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Actions */}
          <section className="border-b border-gray-100 px-5 py-4">
            <div className="grid grid-cols-2 gap-2">
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                >
                  WhatsApp
                </a>
              ) : telHref ? (
                <a
                  href={`tel:${telHref}`}
                  className="rounded-lg bg-gray-900 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-gray-700"
                >
                  Appeler
                </a>
              ) : (
                <span className="rounded-lg border border-dashed border-gray-300 py-2.5 text-center text-sm text-gray-400">
                  Pas de numéro
                </span>
              )}
              <button
                onClick={() => onToggleContacted(row.id)}
                className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                  contactedAt
                    ? "border-gray-300 text-gray-600 hover:bg-gray-50"
                    : "border-gray-900 bg-white text-gray-900 hover:bg-gray-50"
                }`}
              >
                {contactedAt ? "Retirer des contactés" : "Marquer contacté"}
              </button>
            </div>
          </section>

          {/* Coordonnées */}
          <Section titre="Coordonnées">
            <Ligne label="Téléphone">
              {row.telephone ? (
                <span className="flex items-center gap-2">
                  <a href={telHref ? `tel:${telHref}` : undefined} className="tabular-nums text-gray-900 hover:underline">
                    {row.telephone}
                  </a>
                  <button
                    onClick={() => copier(row.telephone!, "tel")}
                    className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    {copie === "tel" ? "Copié" : "Copier"}
                  </button>
                  <span className="text-[11px] text-gray-400">{mobile ? "mobile" : "fixe"}</span>
                </span>
              ) : "—"}
            </Ligne>
            <Ligne label="Email">
              {fiche?.email ? (
                <span className="flex items-center gap-2">
                  <a href={`mailto:${fiche.email}`} className="truncate text-gray-900 hover:underline">{fiche.email}</a>
                  <button
                    onClick={() => copier(fiche.email!, "email")}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    {copie === "email" ? "Copié" : "Copier"}
                  </button>
                </span>
              ) : fiche ? "—" : "…"}
            </Ligne>
            <Ligne label="Site web">
              {row.siteWeb ? (
                <a
                  href={row.siteWeb.startsWith("http") ? row.siteWeb : `https://${row.siteWeb}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-indigo-600 hover:underline"
                >
                  {hostDe(row.siteWeb)}
                </a>
              ) : <span className="text-gray-400">Aucun site</span>}
            </Ligne>
            <Ligne label="Réputation">
              {row.note != null || row.avis != null
                ? <span className="tabular-nums">{row.note ?? "—"} / 5 · {row.avis ?? 0} avis</span>
                : "—"}
            </Ligne>
          </Section>

          {/* Diagnostic */}
          <Section titre="Diagnostic">
            {flags.length > 0 ? (
              <DiagnosticBadges flags={flags} />
            ) : (
              <p className="text-xs text-gray-400">{fiche ? "Aucun problème détecté" : "…"}</p>
            )}
            {row.angle && (
              <p className="mt-2 text-sm text-gray-700">{stripEmoji(row.angle)}</p>
            )}
          </Section>

          {/* Suivi */}
          <Section titre="Suivi">
            <Ligne label="Dernier contact">
              {contactedAt ? `${formatDate(contactedAt)} (il y a ${jours} j)` : <span className="text-gray-400">Jamais contacté</span>}
            </Ligne>
            <Ligne label="Dans la base depuis">{fiche ? formatDate(fiche.createdAt) : "…"}</Ligne>
            {fiche?.rdvAt && <Ligne label="Rendez-vous">{formatDate(fiche.rdvAt)}</Ligne>}
            {audit && (
              <Ligne label="Audit">
                <a href={`/audit/${audit.publicSlug}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                  Score {audit.score} · {audit.viewCount} vue{audit.viewCount > 1 ? "s" : ""}
                </a>
              </Ligne>
            )}
          </Section>

          {/* Notes */}
          <Section titre="Notes">
            <textarea
              value={notes}
              onChange={(e) => majNotes(e.target.value)}
              placeholder="Ce qu'il a dit, quand le rappeler, son prix…"
              rows={5}
              disabled={!fiche}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-900 focus:outline-none disabled:bg-gray-50"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              {notesEtat === "en_cours" ? "Enregistrement…" : notesEtat === "enregistre" ? "Enregistré" : "Sauvegarde automatique"}
            </p>
          </Section>

          {/* Message pré-rempli, pour vérifier avant d'ouvrir WhatsApp */}
          {waUrl && (
            <Section titre="Message pré-rempli">
              <p className="whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{message}</p>
            </Section>
          )}
        </div>
      </aside>
    </div>
  )
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="border-b border-gray-100 px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{titre}</h3>
      {children}
    </section>
  )
}

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 text-right text-gray-800">{children}</span>
    </div>
  )
}
