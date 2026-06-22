# Kodora Prospect

Outil de prospection local pour l'agence Kodora. Sourcez des professionnels locaux, diagnostiquez leur site, scorez les opportunités, générez des emails IA, et pilotez votre pipeline CRM.

## Prérequis

- Node.js 18+
- npm

## Lancement

```bash
npm install
npx prisma migrate dev
npx playwright install chromium   # Pour le scraper fallback (sans clé Google Places)
npm run dev
```

Ouvre http://localhost:3000 → redirige automatiquement vers le Pipeline.

## Variables d'environnement

Crée un fichier `.env.local` à la racine (ou modifie `.env`) :

```env
DATABASE_URL="file:./kodora.db"
ANTHROPIC_API_KEY=""        # Optionnel — pour la génération email IA
GOOGLE_PLACES_API_KEY=""    # Optionnel — pour le sourcing Google Places
```

### Obtenir les clés

**ANTHROPIC_API_KEY** (génération emails) :
→ https://console.anthropic.com → API Keys → Create Key

**GOOGLE_PLACES_API_KEY** (sourcing) :
→ https://console.cloud.google.com → APIs & Services → Credentials
→ Activer : "Places API" et "Places API (New)"
→ Facturation : ~0,017 $ par requête Place Details (volume modéré)

Sans ces clés, l'app fonctionne en mode dégradé :
- Sans Google Places → fallback Playwright (scraper Google Maps)
- Sans Anthropic → template email statique paramétré

## Architecture

```
app/
  pipeline/       → Page principale CRM drag & drop
  sourcer/        → Formulaire de sourcing
  api/
    sourcing/     → Sourcing + diagnostic + scoring (streaming SSE)
    prospects/    → CRUD prospects
    email/        → Génération email IA
    secteurs/     → Liste des secteurs
lib/
  prisma.ts             → Client Prisma singleton
  diagnose.ts           → Diagnostic HTTP du site web
  score.ts              → Algorithme de scoring 0-100
  email-templates.ts    → Templates email statiques (fallback)
  scraper-fallback.ts   → Scraper Playwright Google Maps ⚠️ fragile
components/
  Pipeline.tsx          → Board Kanban drag & drop
  Sourcer.tsx           → Formulaire + progression en direct
  ProspectDetail.tsx    → Panneau de détail prospect
  ScoreBadge.tsx        → Badge coloré score
  DiagnosticBadges.tsx  → Badges problèmes détectés
```

## ⚠️ Note sur le scraper fallback

`lib/scraper-fallback.ts` est fragile par nature : il scrape Google Maps via les sélecteurs DOM de Playwright. Si Google modifie son HTML, les sélecteurs cassent.
**C'est le seul fichier à corriger** en cas de panne du sourcing sans clé Google Places.

## Pipeline auto (source → génère → envoie)

`POST /api/pipeline/run` enchaîne tout le flux en un appel, avec des garde-fous
de délivrabilité :

1. **Source** des prospects (rotation secteurs + ville selon le jour) → `lib/source-prospects.ts`
2. **Génère** les emails IA manquants (boucle `/api/email/batch`)
3. **Envoie** via Brevo, **plafonné** par un ramp progressif + délai aléatoire entre envois

### Ramp d'envoi (warm-up) — `lib/pipeline-config.ts`

| Période        | Plafond / jour |
|----------------|----------------|
| Jours 1-7      | 20             |
| Semaine 2      | 35             |
| Semaine 3      | 55             |
| Semaine 4      | 75             |
| Ensuite        | 90 (max)       |

> ⚠️ **Ne pas désactiver le ramp.** 100 cold emails/jour depuis un domaine neuf
> = spam + blacklist + suspension Brevo. Le plafond protège ta délivrabilité.
> Le pipeline ne dépasse jamais le cap, même si appelé plusieurs fois par jour.

### Lancer manuellement

```bash
# Run complet (source + génère + envoie, plafonné)
curl -X POST http://localhost:3000/api/pipeline/run

# Test sans envoyer (source + génère seulement)
curl -X POST "http://localhost:3000/api/pipeline/run?dry=1"
```

### Automatiser sur Vercel (cron intégré)

`vercel.json` déclare un cron quotidien qui appelle `/api/pipeline/run` :

```json
{ "crons": [{ "path": "/api/pipeline/run", "schedule": "0 8 * * *" }] }
```

→ Vercel déclenche le pipeline chaque jour à 08:00 UTC, **sans Mac allumé**.
Vercel envoie automatiquement `Authorization: Bearer $CRON_SECRET` ; la route
vérifie ce secret (`isAuthorized`).

**Variables d'env à définir sur Vercel** (Project → Settings → Environment Variables) :

| Variable | Rôle |
|----------|------|
| `CRON_SECRET` | Sécurise le cron (Vercel l'envoie en header). Génère une chaîne aléatoire. |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Envoi des emails |
| `GOOGLE_PLACES_API_KEY` | Sourcing |
| `ANTHROPIC_API_KEY` | Génération IA (optionnel) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Base de données prod |
| `NEXT_PUBLIC_BASE_URL` | URL prod (ex: `https://kodora-prospect.vercel.app`) |

> ⚠️ **Vercel Hobby** = 60s max par fonction + 1 cron/jour. Le pipeline respecte
> un budget temps (`RUN_TIME_BUDGET_MS`) et s'arrête proprement avant le timeout ;
> le reste partira au run suivant. Pour plusieurs runs/jour ou des envois plus
> espacés, passe en plan **Pro**.

### Migration

Le pipeline ajoute un model `PipelineRun` (trace + comptage du quota quotidien) :

```bash
npx prisma migrate dev --name add_pipeline_run
```

## Cold email — RGPD

- **Respecte le ramp** ci-dessus — c'est la règle n°1 pour ne pas griller le domaine.
- Chaque email inclut un opt-out "répondez STOP".
- Ne fais pas de WhatsApp/SMS à froid (risque de ban + sanctions RGPD).
- Brevo tolère mal le cold pur : pour scaler au-delà du ramp, envisage un outil
  dédié (Instantly / Smartlead) avec warm-up intégré.
