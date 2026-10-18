#!/bin/bash
# Recrée une base vierge comme sur Render : un compte propriétaire SANS superutilisateur (droits CREATEROLE + CREATEDB),
# applique toutes les migrations avec ce compte, puis lance les tests SQL.
# Variables : PGHOST (défaut /tmp), PGPORT (défaut 54329), PGSUPER (défaut postgres), PGPASSWORD (si connexion par mot de passe).
# Avec la base Docker du projet : PGHOST=localhost PGPORT=5433 PGSUPER=ceremonia PGPASSWORD=ceremonia-local pnpm test:db
set -e
H="${PGHOST:-/tmp}"; PORT="${PGPORT:-54329}"; SU="${PGSUPER:-postgres}"
S="psql -h $H -p $PORT -U $SU -v ON_ERROR_STOP=1 -q"
$S -d postgres -c "drop database if exists cer_test"
$S -d postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='ceremonia_owner') then create role ceremonia_owner login createrole createdb; end if; end \$\$"
if [ -n "${PGPASSWORD:-}" ]; then $S -d postgres -c "alter role ceremonia_owner password '${PGPASSWORD//\'/}'"; fi
$S -d postgres -c "create database cer_test owner ceremonia_owner"
P="psql -h $H -p $PORT -U ceremonia_owner -d cer_test -v ON_ERROR_STOP=1 -q"
for f in "$(dirname $0)"/../migrations/*.sql; do echo "== $(basename $f)"; $P -f "$f"; done
echo "migrations OK"
for t in "$(dirname $0)"/1*_*.sql; do echo "== $(basename $t)"; $P -f "$t" 2>&1 | sed -n "s/^psql:.*NOTICE:  //p;/ERROR/p"; done
