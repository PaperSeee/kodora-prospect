"use client"

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 50
      ? "bg-orange-500 text-white"
      : score >= 30
      ? "bg-yellow-400 text-black"
      : "bg-zinc-600 text-zinc-200"

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>
      {score}
    </span>
  )
}
