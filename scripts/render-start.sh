#!/usr/bin/env bash
# Démarrage sur Render : applique les migrations manquantes (verrou partagé entre les deux services),
# puis lance Next.js sur 0.0.0.0 et sur le port fourni par Render ($PORT).
# Usage : bash scripts/render-start.sh web|admin
set -euo pipefail
APP="${1:?usage: render-start.sh web|admin}"
case "$APP" in web|admin) ;; *) echo "Application inconnue : $APP" >&2; exit 2;; esac
for v in DATABASE_URL ORGANIZER_ORIGIN ADMIN_ORIGIN; do
  if [ -z "${!v:-}" ]; then echo "Variable manquante : $v (à définir dans Render > Environment)" >&2; exit 1; fi
done
if [ "$ORGANIZER_ORIGIN" = "$ADMIN_ORIGIN" ]; then echo "ORGANIZER_ORIGIN et ADMIN_ORIGIN doivent être deux domaines différents." >&2; exit 1; fi
node packages/server/scripts/migrate.mjs db/migrations
cd "apps/${APP}"
export NODE_ENV=production
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-10000}"
