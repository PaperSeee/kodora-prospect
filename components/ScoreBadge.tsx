"use client"

export function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 50
      ? "bg-orange-500 text-white"
      : score >= 30
      ? "bg-amber-400 text-black"
      : "bg-gray-100 text-gray-600"

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>
      {score}
    </span>
  )
}
