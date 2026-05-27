import { NextResponse } from "next/server"

// Appelé toutes les heures par le cron LaunchAgent
// Déclenche la route /api/relance
export async function GET() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    const res = await fetch(`${base}/api/relance`, { method: "POST" })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
