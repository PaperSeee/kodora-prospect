// Agent de sourcing local — serveur HTTP qui tourne sur ta machine, PAS sur
// Vercel, donc aucun plafond de 60s. Le bouton "Sourcer gros volume" du
// dashboard (app/api/pipeline/local-agent/route.ts, côté Vercel) relaie
// l'appel ici via un tunnel public (ngrok ou équivalent) que TU dois lancer
// et dont TU dois donner l'URL au dashboard (voir procédure ci-dessous).
//
// SÉCURITÉ : toute requête doit porter le header x-api-key avec la valeur de
// SOURCING_AGENT_KEY (même mécanisme que KODORA_INTERNAL_API_KEY ailleurs
// dans ce repo). Sans la bonne clé, la requête est rejetée (401) — même si
// quelqu'un devine ou trouve l'URL ngrok publique. Ne jamais lancer ce
// serveur sans définir SOURCING_AGENT_KEY dans .env.local.
//
// Usage — IMPORTANT : npx résout "scripts/sourcing-agent.ts" par rapport au
// dossier depuis lequel tu lances la commande, pas par rapport à ce fichier.
// Il faut donc être dans le dossier du repo AVANT de lancer npx — un simple
// "cd" dans le script ne peut pas réparer ça, npx a déjà échoué à trouver
// le fichier avant que la moindre ligne de ce code ne s'exécute.
//
//   cd "/Users/paperhq/seo-run/sites/kodora-prospect"
//   npx tsx scripts/sourcing-agent.ts
//   (dans un autre terminal) ngrok http 3999
//   → copie l'URL affichée par ngrok (https://xxxx.ngrok-free.app ou .dev)
//   → colle-la dans Vercel comme SOURCING_AGENT_URL (Settings → Environment
//     Variables), avec SOURCING_AGENT_KEY = la même valeur que ton .env.local
//
// Le serveur reste UP tant que le terminal est ouvert. Ctrl+C pour arrêter.

import path from "path"
import { config } from "dotenv"
// Résolu par rapport à CE FICHIER, pas au dossier depuis lequel npx a été
// lancé — sans ça, un simple "cd ~ && npx tsx <chemin relatif au repo>"
// (qui échoue de toute façon, voir plus haut) laissait aussi ce chemin
// pointer vers un .env.local inexistant si jamais npx trouvait le fichier
// par un autre biais (ex. chemin absolu donné explicitement).
config({ path: path.resolve(__dirname, "..", ".env.local") })

import http from "http"
import fs from "fs"
import { sourceSecteur } from "../lib/source-prospects"
import { generateEmailBatch } from "../lib/generate-emails"
import { SECTEURS_ROTATION, COMMUNES, MAX_PAR_SECTEUR, DIAG_TIMEOUT_PIPELINE_MS } from "../lib/pipeline-config"
import { prisma } from "../lib/prisma"

// Curseur de rotation persisté localement (pas en base — c'est un état de
// progression de l'outil, pas une donnée métier). Sans lui, chaque
// lancement recommençait à Bruxelles + le premier secteur de la liste :
// sourceSecteur() déduplique par nom+ville, donc ces premières combinaisons
// ne rapportaient presque plus rien après le 2e ou 3e run — tout le temps
// passait à re-scraper ce qui existait déjà avant d'atteindre du neuf.
const CURSOR_FILE = path.resolve(__dirname, "..", ".sourcing-agent-cursor.json")

function loadCursor(): { communeIdx: number; secteurIdx: number } {
  try {
    return JSON.parse(fs.readFileSync(CURSOR_FILE, "utf-8"))
  } catch {
    return { communeIdx: 0, secteurIdx: 0 }
  }
}

function saveCursor(communeIdx: number, secteurIdx: number) {
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ communeIdx, secteurIdx }))
}

const PORT = Number(process.env.SOURCING_AGENT_PORT) || 3999
const API_KEY = process.env.SOURCING_AGENT_KEY

if (!API_KEY) {
  console.error("SOURCING_AGENT_KEY manquant dans .env.local — génère une valeur aléatoire et ajoute-la avant de lancer ce serveur.")
  console.error(`Exemple : openssl rand -hex 24`)
  process.exit(1)
}

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN manquants dans .env.local — cet agent écrit sur la base de PROD.")
  process.exit(1)
}

let running = false

const server = http.createServer(async (req, res) => {
  // CORS minimal pour que le dashboard (autre origine) puisse appeler ce serveur.
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, running }))
    return
  }

  if (req.url !== "/source" || req.method !== "POST") {
    res.writeHead(404)
    res.end()
    return
  }

  const key = req.headers["x-api-key"]
  if (key !== API_KEY) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Unauthorized" }))
    return
  }

  if (running) {
    res.writeHead(409, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Un sourcing est déjà en cours sur cet agent." }))
    return
  }

  let body = ""
  for await (const chunk of req) body += chunk
  const parsed = JSON.parse(body || "{}")
  const objectif = Math.min(Math.max(Number(parsed.objectif) || 200, 1), 2000)

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  running = true
  try {
    const tousSecteurs = [...new Set(SECTEURS_ROTATION.flat())]
    let sourced = 0

    // Reprend là où le run précédent s'est arrêté — jamais Bruxelles +
    // premier secteur à chaque fois (voir le pourquoi en haut du fichier).
    const cursor = loadCursor()
    send({
      type: "progress",
      message: `Objectif : ${objectif} prospects — reprise à ${COMMUNES[cursor.communeIdx % COMMUNES.length]} / ${tousSecteurs[cursor.secteurIdx % tousSecteurs.length]} (sans limite de temps).`,
    })

    const totalPaires = COMMUNES.length * tousSecteurs.length
    let pairesVues = 0
    let ci = cursor.communeIdx
    let si = cursor.secteurIdx
    let lastCommune = ""

    // Arrête proprement après une longue série de paires sans le moindre
    // résultat — sinon, quand les serveurs Overpass sont rate-limités
    // (tous les miroirs en 429/500/502/504, ce qui arrive après un gros
    // volume dans la même session), l'agent boucle sur les 261 paires
    // commune×secteur sans jamais rien trouver ni s'arrêter, juste des
    // pages d'erreurs sans qu'on sache que c'est un vrai problème externe.
    const MAX_ECHECS_CONSECUTIFS = 20
    let echecsConsecutifs = 0
    let arretPourEchecs = false

    while (sourced < objectif && pairesVues < totalPaires) {
      const commune = COMMUNES[ci % COMMUNES.length]
      const secteur = tousSecteurs[si % tousSecteurs.length]

      if (commune !== lastCommune) {
        send({ type: "progress", message: `📍 Commune : ${commune}` })
        lastCommune = commune
      }

      const avant = sourced
      try {
        sourced += await sourceSecteur(secteur, commune, MAX_PAR_SECTEUR, undefined, DIAG_TIMEOUT_PIPELINE_MS, undefined)
      } catch (err) {
        send({ type: "progress", message: `  ✗ erreur ${secteur}/${commune}: ${String(err)}` })
      }
      const nouveaux = sourced - avant
      if (nouveaux > 0) {
        send({ type: "progress", message: `  + ${nouveaux} en ${secteur} (${sourced}/${objectif})` })
        echecsConsecutifs = 0
      } else {
        echecsConsecutifs++
        if (echecsConsecutifs >= MAX_ECHECS_CONSECUTIFS) {
          send({
            type: "progress",
            message: `⚠️ ${MAX_ECHECS_CONSECUTIFS} paires de suite sans aucun résultat — probablement les serveurs Overpass gratuits rate-limités (429) après un gros volume. Arrêt propre, réessaie dans 15-30 min.`,
          })
          arretPourEchecs = true
          break
        }
      }

      // Avance le curseur (secteur d'abord, puis commune) et le sauve après
      // CHAQUE paire — si l'agent est arrêté en cours de route (Ctrl+C,
      // crash), le prochain lancement reprend exactement ici, pas depuis le
      // début du run interrompu.
      si++
      if (si % tousSecteurs.length === 0) ci++
      pairesVues++
      saveCursor(ci % COMMUNES.length, si % tousSecteurs.length)
    }

    if (pairesVues >= totalPaires) {
      send({ type: "progress", message: `Toutes les combinaisons commune×secteur ont été vues sur ce passage (${sourced}/${objectif}) — le curseur reboucle depuis le début au prochain lancement.` })
    }

    send({ type: "progress", message: `Sourcing fini (${sourced}). Génération des emails...` })
    let generated = 0
    while (true) {
      const count = await generateEmailBatch({ take: 10 })
      if (!count) break
      generated += count
      send({ type: "progress", message: `  ✍️ ${generated} emails générés...` })
    }

    const stockPret = await prisma.prospect.count({
      where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
    })

    send({ type: "done", sourced, generated, stockPret, arretPourEchecs })
  } catch (err) {
    send({ type: "error", message: String(err) })
  } finally {
    running = false
    res.end()
  }
})

server.listen(PORT, () => {
  console.log(`Agent de sourcing local sur http://localhost:${PORT}`)
  console.log(`Prochaine étape : dans un autre terminal, lance "ngrok http ${PORT}"`)
  console.log(`puis colle l'URL ngrok + cette clé dans Vercel (voir en-tête du fichier).`)
})
