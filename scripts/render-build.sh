#!/usr/bin/env bash
# Compilation sur Render d'une application du monorepo : web (organisateur, invités, personnel) ou admin.
# Usage : bash scripts/render-build.sh web|admin
set -euo pipefail
APP="${1:?usage: render-build.sh web|admin}"
case "$APP" in web|admin) ;; *) echo "Application inconnue : $APP" >&2; exit 2;; esac
PNPM_VERSION="9.12.0" # identique au champ packageManager de package.json

# pnpm : via corepack (recommandé par Render), sinon via npx.
corepack enable >/dev/null 2>&1 || true
if pnpm --version 2>/dev/null | grep -q "^${PNPM_VERSION}$"; then PNPM=(pnpm); else PNPM=(npx --yes "pnpm@${PNPM_VERSION}"); fi
echo "pnpm : $("${PNPM[@]}" --version) · node : $(node --version)"

# Sans pnpm-lock.yaml dans le dépôt, l'installation ne peut pas être « figée ».
if [ -f pnpm-lock.yaml ]; then "${PNPM[@]}" install --frozen-lockfile; else "${PNPM[@]}" install --no-frozen-lockfile; fi
"${PNPM[@]}" --filter "@ceremonia/${APP}" build
