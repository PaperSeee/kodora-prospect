// Sourcing manuel SANS le plafond 60s de Vercel Hobby — tourne sur ta
// machine, importe directement lib/source-prospects.ts et
// lib/generate-emails.ts (le même code que la route /api/pipeline/stock),
// donc zéro divergence de logique avec le bouton "Préparer un gros stock".
//
// Reprend automatiquement où le dernier run (via ce script OU via
// scripts/sourcing-agent.ts — même fichier curseur partagé) s'est arrêté :
// jamais Bruxelles + le premier secteur de la rotation à chaque lancement,
// sinon sourceSecteur() (qui déduplique par nom+ville) ne rapporte
// quasiment plus rien après le 2e ou 3e run — tout le temps part à
// re-scraper ce qui existe déjà avant d'atteindre du neuf.
//
// Usage :
//   npx tsx scripts/source-manual.ts --objectif=500
//   npx tsx scripts/source-manual.ts --objectif=500 --reset   (repart de Bruxelles)
//
// Nécessite TURSO_DATABASE_URL/TURSO_AUTH_TOKEN dans .env.local.

import "dotenv/config"
import { config } from "dotenv"
config({ path: ".env.local" })

import fs from "fs"
import path from "path"
import { sourceSecteur } from "../lib/source-prospects"
import { generateEmailBatch } from "../lib/generate-emails"
import { SECTEURS_ROTATION, COMMUNES, MAX_PAR_SECTEUR, DIAG_TIMEOUT_PIPELINE_MS } from "../lib/pipeline-config"
import { prisma } from "../lib/prisma"

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

function argNumber(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!arg) return fallback
  const n = Number(arg.split("=")[1])
  return Number.isFinite(n) ? n : fallback
}

const objectif = argNumber("objectif", 200)
const reset = process.argv.includes("--reset")

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN manquants dans .env.local — vise la base de PROD.")
    process.exit(1)
  }

  const tousSecteurs = [...new Set(SECTEURS_ROTATION.flat())]
  const cursor = reset ? { communeIdx: 0, secteurIdx: 0 } : loadCursor()

  console.log(`Objectif : ${objectif} prospects — reprise à ${COMMUNES[cursor.communeIdx % COMMUNES.length]} / ${tousSecteurs[cursor.secteurIdx % tousSecteurs.length]}\n`)

  let sourced = 0
  const startedAt = Date.now()
  const totalPaires = COMMUNES.length * tousSecteurs.length
  let pairesVues = 0
  let ci = cursor.communeIdx
  let si = cursor.secteurIdx
  let lastCommune = ""

  // Arrête proprement après une longue série de paires sans résultat —
  // sinon, serveurs Overpass rate-limités (429/500/502/504, fréquent après
  // un gros volume dans la même session) = boucle sur les 261 paires sans
  // rien trouver, juste des pages d'erreurs sans jamais s'arrêter.
  const MAX_ECHECS_CONSECUTIFS = 20
  let echecsConsecutifs = 0

  while (sourced < objectif && pairesVues < totalPaires) {
    const commune = COMMUNES[ci % COMMUNES.length]
    const secteur = tousSecteurs[si % tousSecteurs.length]

    if (commune !== lastCommune) {
      console.log(`📍 Commune : ${commune}`)
      lastCommune = commune
    }

    const avant = sourced
    try {
      sourced += await sourceSecteur(secteur, commune, MAX_PAR_SECTEUR, undefined, DIAG_TIMEOUT_PIPELINE_MS, undefined)
    } catch (err) {
      console.error(`  ✗ erreur sur ${secteur}/${commune}:`, err)
    }
    const nouveaux = sourced - avant
    if (nouveaux > 0) {
      console.log(`  + ${nouveaux} en ${secteur} (${sourced}/${objectif})`)
      echecsConsecutifs = 0
    } else {
      echecsConsecutifs++
      if (echecsConsecutifs >= MAX_ECHECS_CONSECUTIFS) {
        console.log(`\n⚠️ ${MAX_ECHECS_CONSECUTIFS} paires de suite sans aucun résultat — probablement les serveurs Overpass gratuits rate-limités. Arrêt propre, réessaie dans 15-30 min.`)
        break
      }
    }

    si++
    if (si % tousSecteurs.length === 0) ci++
    pairesVues++
    saveCursor(ci % COMMUNES.length, si % tousSecteurs.length)
  }

  if (pairesVues >= totalPaires) {
    console.log(`\nToutes les combinaisons commune×secteur ont été vues sur ce passage (${sourced}/${objectif}) — reboucle depuis le début au prochain lancement.`)
  }

  const elapsedSourcing = Math.round((Date.now() - startedAt) / 1000)
  console.log(`\nSourcing terminé en ${elapsedSourcing}s : ${sourced} prospects.`)
  console.log("Génération des emails...")

  let generated = 0
  while (true) {
    const count = await generateEmailBatch({ take: 10 })
    if (!count) break
    generated += count
    process.stdout.write(`\r  ✍️ ${generated} emails générés...`)
  }
  console.log()

  const stockPret = await prisma.prospect.count({
    where: { email: { not: null }, emailCorps: { not: null }, statut: "a_contacter" },
  })

  console.log(`\nTerminé — sourced: ${sourced}, generated: ${generated}, stock prêt à contacter: ${stockPret}`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
