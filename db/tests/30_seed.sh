#!/bin/bash
# Vérifie que les données de démonstration locales se chargent sur une base neuve et respectent toutes les règles.
set -e
H="${PGHOST:-/tmp}"; PORT="${PGPORT:-54329}"; SU="${PGSUPER:-postgres}"
D="$(dirname $0)"
psql -h $H -p $PORT -U $SU -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists cer_seed" -c "create database cer_seed owner ceremonia_owner"
P="psql -h $H -p $PORT -U ceremonia_owner -d cer_seed -v ON_ERROR_STOP=1 -q"
for f in "$D"/../migrations/*.sql; do $P -f "$f"; done
$P -f "$D/../seed.sql"
$P -f "$D/../seed.sql"   # rejouable sans erreur
$P -At -c "select count(*) from public.guests" | grep -qx 6
$P -At -c "select count(*) from public.staff_accounts where password_hash like '\$2a\$%'" | grep -qx 2
# invitation fermée tant que le paiement n'est pas confirmé (même en démo)
$P -At -c "set role anon; select public.get_invitation('demo-invitation-mbuyi-01') is null" | grep -qx t
# connexion du contrôleur démo
$P -At -c "set role anon; select (public.staff_login('DEMO2026', '44444444-4444-4444-8444-444444444441', 'CTL234', 'controle1') ->> 'ok')" | grep -qx true
# connexion de l'organisateur démo (mot de passe bcrypt vérifié par la base)
$P -At -c "select count(*) from auth.users where email = 'organisateur@demo.local' and encrypted_password = extensions.crypt('Demo-Organisateur-1', encrypted_password)" | grep -qx 1
echo "OK   données de démonstration : chargées, rejouables, règles respectées"
