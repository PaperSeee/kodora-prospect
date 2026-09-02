import { NextRequest, NextResponse } from "next/server"

// Relaie un sourcing "gros volume" vers l'agent local (scripts/sourcing-agent.ts)
// qui tourne sur la machine d'Ilias, hors de la limite 60s Vercel Hobby —
// voir ce fichier pour le pourquoi (Vercel ne peut pas déclencher un
// processus sur une machine tierce sans qu'elle expose elle-même un point
// d'entrée réseau).
//
// SOURCING_AGENT_URL et SOURCING_AGENT_KEY doivent être définies dans les
// variables d'environnement Vercel — l'URL change à chaque redémarrage de
// ngrok côté agent local, donc à remettre à jour à chaque session de
// sourcing (voir le bouton "Sourcer gros volume" du dashboard, qui affiche
// un message clair si l'agent n'est pas joignable plutôt que d'échouer en
// silence).
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const agentUrl = process.env.SOURCING_AGENT_URL
  const agentKey = process.env.SOURCING_AGENT_KEY

  if (!agentUrl || !agentKey) {
    return NextResponse.json(
      { error: "Agent local non configuré (SOURCING_AGENT_URL / SOURCING_AGENT_KEY manquants sur Vercel)." },
      { status: 503 }
    )
  }

  const body = await req.json().catch(() => ({}))

  let agentRes: Response
  try {
    agentRes = await fetch(`${agentUrl}/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": agentKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(280_000),
    })
  } catch (err) {
    return NextResponse.json(
      { error: "Agent local injoignable — vérifie qu'il tourne (npx tsx scripts/sourcing-agent.ts) et que le tunnel ngrok est actif.", detail: String(err) },
      { status: 502 }
    )
  }

  if (!agentRes.ok || !agentRes.body) {
    return NextResponse.json({ error: "L'agent local a répondu une erreur.", status: agentRes.status }, { status: 502 })
  }

  // Relaie le flux SSE tel quel au client — le dashboard affiche la
  // progression exactement comme si l'agent tournait sur Vercel.
  return new NextResponse(agentRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

// Vérifie si l'agent local est configuré et joignable, sans lancer de sourcing.
export async function GET() {
  const agentUrl = process.env.SOURCING_AGENT_URL
  const agentKey = process.env.SOURCING_AGENT_KEY

  if (!agentUrl || !agentKey) {
    return NextResponse.json({ configured: false, reachable: false })
  }

  try {
    const res = await fetch(`${agentUrl}/health`, {
      headers: { "x-api-key": agentKey },
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ configured: true, reachable: res.ok, running: data.running ?? false })
  } catch {
    return NextResponse.json({ configured: true, reachable: false })
  }
}
