#!/bin/zsh
# ── Répare l'installation locale de Kodora Prospect ──
# À lancer une seule fois :  zsh ~/seo-run/sites/kodora-prospect/infra/reparer.sh
set -e

APP="$HOME/seo-run/sites/kodora-prospect"
UID_=$(id -u)

echo "1/5 — Arrêt des anciens agents (boucle de crash sur /tmp)…"
launchctl bootout "gui/$UID_/eu.kodora.prospect" 2>/dev/null || true
launchctl bootout "gui/$UID_/eu.kodora.prospect.cron" 2>/dev/null || true

echo "2/5 — Restauration des 2750 prospects depuis le backup…"
if [ -f "$APP/backup-prospect-20260623.sql" ]; then
  cp "$APP/kodora.db" "$APP/kodora.db.bak-$(date +%Y%m%d%H%M)"
  sqlite3 "$APP/kodora.db" < "$APP/backup-prospect-20260623.sql"
  echo "   → $(sqlite3 "$APP/kodora.db" 'SELECT COUNT(*) FROM Prospect;') prospects en base"
fi

echo "3/5 — Installation des LaunchAgents corrigés (dossier persistant)…"
cp "$APP/infra/eu.kodora.prospect.plist" ~/Library/LaunchAgents/
cp "$APP/infra/eu.kodora.prospect.cron.plist" ~/Library/LaunchAgents/

echo "4/5 — Démarrage…"
launchctl bootstrap "gui/$UID_" ~/Library/LaunchAgents/eu.kodora.prospect.plist
launchctl bootstrap "gui/$UID_" ~/Library/LaunchAgents/eu.kodora.prospect.cron.plist
sleep 5

echo "5/5 — Vérification…"
if curl -sf -o /dev/null http://localhost:3000; then
  echo "   ✓ App en ligne sur http://localhost:3000"
else
  echo "   ✗ L'app ne répond pas encore — voir ~/Library/Logs/kodora-prospect.log"
fi

# Rappel clé Brevo
if grep -q '^BREVO_API_KEY=""' "$APP/.env.local" 2>/dev/null || grep -q '^BREVO_API_KEY=$' "$APP/.env.local" 2>/dev/null; then
  echo ""
  echo "⚠️  BREVO_API_KEY est VIDE dans $APP/.env.local"
  echo "   → https://app.brevo.com → Settings → SMTP & API → créer une clé"
  echo "   → la coller, puis :  launchctl kickstart -k gui/$UID_/eu.kodora.prospect"
  echo "   (gratuit jusqu'à 300 emails/jour — le pipeline en envoie max 50)"
fi
