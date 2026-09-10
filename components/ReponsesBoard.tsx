"use client"

import { useState } from "react"
import { OBJECTIONS, WHATSAPP_CLOSING_MESSAGE } from "@/lib/pipeline-config"

// Scripts de réponse pour la suite de la conversation WhatsApp — une fois
// que le premier message a eu une réponse. Page de référence à garder
// ouverte pendant qu'on répond : chaque bloc se copie en un clic, pour
// coller la réponse dans WhatsApp sans retaper ni faire d'aller-retour.

export function ReponsesBoard() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <header>
        <h1 className="text-lg font-semibold text-gray-900">Réponses</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pré-réponses pour la suite de la conversation. Copie, colle, adapte si besoin.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Si ça part en objection
        </h2>
        <div className="space-y-3">
          {OBJECTIONS.map((o) => (
            <ObjectionCard key={o.question} question={o.question} reponse={o.reponse} />
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Dis la vérité, un artisan repère le baratin en trois secondes.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Closing — quand le prospect dit oui
        </h2>
        <CopyBlock texte={WHATSAPP_CLOSING_MESSAGE} />
      </section>
    </div>
  )
}

function ObjectionCard({ question, reponse }: { question: string; reponse: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-900">{question}</p>
      <div className="mt-2">
        <CopyBlock texte={reponse} />
      </div>
    </div>
  )
}

function CopyBlock({ texte }: { texte: string }) {
  const [copie, setCopie] = useState(false)

  const copier = () => {
    navigator.clipboard.writeText(texte).then(() => {
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    }).catch(() => {})
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="whitespace-pre-line text-sm text-gray-700">{texte}</p>
      <button
        onClick={copier}
        className="mt-2 rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        {copie ? "Copié" : "Copier"}
      </button>
    </div>
  )
}
