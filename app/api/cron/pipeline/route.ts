import { NextResponse } from "next/server"

// Appelé 1×/jour par le cron (LaunchAgent) → déclenche le pipeline complet.
// Même pattern que /api/cron/relance.
export async function GET() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    const res = await fetch(`${base}/api/pipeline/run`, { method: "POST" })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
