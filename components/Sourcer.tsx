"use client"

import { useState, useEffect } from "react"

interface ProgressLine {
  type: "progress" | "done"
  message?: string
  totalInserts?: number
}

interface SecteursData {
  secteurs: string[]
  categories: Record<string, string[]>
}

export function Sourcer() {
  const [ville, setVille] = useState("Bruxelles")
  const [secteurs, setSecteurs] = useState<string[]>([])
  const [maxParSecteur, setMaxParSecteur] = useState(20)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<ProgressLine[]>([])
  const [done, setDone] = useState(false)
  const [data, setData] = useState<SecteursData>({ secteurs: [], categories: {} })
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [searchSecteur, setSearchSecteur] = useState("")

  useEffect(() => {
    fetch("/api/secteurs")
      .then((r) => r.json())
      .then(setData)
  }, [])

  const toggleSecteur = (s: string) =>
    setSecteurs((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])

  const selectCat = (cat: string) => {
    const list = data.categories[cat] ?? []
    const allIn = list.every((s) => secteurs.includes(s))
    if (allIn) setSecteurs((prev) => prev.filter((s) => !list.includes(s)))
    else setSecteurs((prev) => [...new Set([...prev, ...list])])
  }

  const selectAll = () => setSecteurs([...data.secteurs])
  const clearAll = () => setSecteurs([])

  const filtered = searchSecteur
    ? data.secteurs.filter((s) => s.toLowerCase().includes(searchSecteur.toLowerCase()))
    : null

  const launch = async () => {
    if (!secteurs.length) return
    setRunning(true)
    setDone(false)
    setLog([])

    const res = await fetch("/api/sourcing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ville, secteurs, maxParSecteur }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        try {
          const parsed: ProgressLine = JSON.parse(line.slice(6))
          setLog((prev) => [...prev, parsed])
          if (parsed.type === "done") setDone(true)
        } catch {}
      }
    }
    setRunning(false)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Encart RGPD */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        ⚠️ <strong>Cold email uniquement.</strong> Volume modéré, opt-out "répondez STOP" inclus. Pas de WhatsApp/SMS à froid.
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-5">
        {/* Ville */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-400">Ville</label>
            <input
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className="w-full rounded bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Max par secteur : <span className="text-white font-semibold">{maxParSecteur}</span>
            </label>
            <input
              type="range" min={5} max={100} step={5}
              value={maxParSecteur}
              onChange={(e) => setMaxParSecteur(parseInt(e.target.value))}
              className="w-full accent-indigo-500 mt-2"
            />
          </div>
        </div>

        {/* Secteurs */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-400">
              Secteurs <span className="text-indigo-400 ml-1">({secteurs.length} sélectionnés)</span>
            </label>
            <div className="flex gap-3 text-xs">
              <button onClick={selectAll} className="text-indigo-400 hover:text-indigo-300">Tout ({data.secteurs.length})</button>
              <span className="text-zinc-600">|</span>
              <button onClick={clearAll} className="text-zinc-400 hover:text-zinc-300">Effacer</button>
            </div>
          </div>

          {/* Recherche */}
          <input
            value={searchSecteur}
            onChange={(e) => setSearchSecteur(e.target.value)}
            placeholder="Rechercher un secteur..."
            className="mb-3 w-full rounded bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          {/* Mode recherche */}
          {filtered ? (
            <div className="flex flex-wrap gap-2">
              {filtered.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSecteur(s)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    secteurs.includes(s) ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            /* Mode catégories */
            <div className="space-y-2">
              {Object.entries(data.categories).map(([cat, list]) => {
                const selectedInCat = list.filter((s) => secteurs.includes(s)).length
                const isOpen = openCat === cat
                return (
                  <div key={cat} className="rounded-lg border border-zinc-700 overflow-hidden">
                    <button
                      onClick={() => setOpenCat(isOpen ? null : cat)}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          onClick={(e) => { e.stopPropagation(); selectCat(cat) }}
                          className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                            selectedInCat === list.length
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : selectedInCat > 0
                              ? "bg-indigo-900 border-indigo-700 text-indigo-300"
                              : "border-zinc-600 text-zinc-500 hover:border-zinc-400"
                          }`}
                        >
                          {selectedInCat > 0 ? `${selectedInCat}/${list.length}` : "Tout"}
                        </span>
                        <span className="text-zinc-200 font-medium">{cat}</span>
                      </div>
                      <span className="text-zinc-500 text-xs">{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && (
                      <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1 border-t border-zinc-700 bg-zinc-800/40">
                        {list.map((s) => (
                          <button
                            key={s}
                            onClick={() => toggleSecteur(s)}
                            className={`rounded-full px-3 py-1 text-xs transition-colors ${
                              secteurs.includes(s)
                                ? "bg-indigo-600 text-white"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={launch}
          disabled={running || !secteurs.length}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running
            ? `Sourcing en cours... (${secteurs.length} secteurs × ${maxParSecteur} max)`
            : `🚀 Lancer le sourcing — ${secteurs.length} secteur${secteurs.length > 1 ? "s" : ""} × ${maxParSecteur} max = jusqu'à ${secteurs.length * maxParSecteur} prospects`}
        </button>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Progression</h3>
          <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
            {log.map((line, i) => (
              <div key={i} className={line.type === "done" ? "text-emerald-400 font-semibold" : "text-zinc-400"}>
                {line.type === "done"
                  ? `✅ Terminé — ${line.totalInserts} nouveau(x) prospect(s) ajouté(s)`
                  : `→ ${line.message}`}
              </div>
            ))}
          </div>
          {done && (
            <a href="/pipeline" className="mt-4 inline-block rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600">
              Voir le pipeline →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
