"use client"

import type { DiagnosticFlag } from "@/lib/diagnose"

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  AUCUN_SITE: { label: "Aucun site", color: "bg-red-600" },
  SITE_INACCESSIBLE: { label: "Site inaccessible", color: "bg-red-500" },
  SITE_LENT: { label: "Site lent", color: "bg-yellow-500" },
  PAS_MOBILE: { label: "Pas mobile", color: "bg-orange-500" },
}

export function DiagnosticBadges({ flags }: { flags: DiagnosticFlag[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {flags.filter((f) => (f as string) !== "PAS_HTTPS").map((flag) => {
        let label = flag as string
        let color = "bg-zinc-600"

        if (flag in FLAG_LABELS) {
          label = FLAG_LABELS[flag].label
          color = FLAG_LABELS[flag].color
        } else if (flag.startsWith("SITE_HS_")) {
          label = `Erreur ${flag.replace("SITE_HS_", "")}`
          color = "bg-red-500"
        } else if (flag.startsWith("SITE_DATE_")) {
          label = `Site de ${flag.replace("SITE_DATE_", "")}`
          color = "bg-purple-600"
        }

        return (
          <span
            key={flag}
            className={`rounded px-1.5 py-0.5 text-xs font-medium text-white ${color}`}
          >
            {label}
          </span>
        )
      })}
    </div>
  )
}
