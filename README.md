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

## Cold email — RGPD

L'outil prépare les emails mais **n'envoie rien automatiquement**.
- Volume modéré uniquement (< 100/jour recommandé)
- Chaque email inclut un opt-out "répondez STOP"
- Ne faites pas de WhatsApp/SMS à froid (risque de ban + sanctions RGPD)
