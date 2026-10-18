#!/bin/bash
# 20 contrôleurs (connexions séparées) valident la même invitation au même instant.
P="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-54329} -U ceremonia_owner -d cer_test -At -v ON_ERROR_STOP=1"
$P -q <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'conc@test') on conflict do nothing;
insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000000c1', 'Conc') on conflict do nothing;
insert into public.events (id, owner_id, title, event_date, venue, address, table_capacity, offer)
values ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-0000000000c1', 'Concurrence', current_date + 5, 'V', 'A', 10, 'drinks') on conflict do nothing;
insert into public.catalog_items (id, event_id, kind, name) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000e0c1', 'drink', 'Eau') on conflict do nothing;
insert into public.guests (id, event_id, name, kind, rsvp) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000e0c1', 'Couple Test', 'couple', 'yes') on conflict do nothing;
insert into public.guest_orders (guest_id, event_id, drinks) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000e0c1', array['00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1']::uuid[]) on conflict do nothing;
SQL
TOKS=(); STOKS=()
SH=$($P -c "select short_id from public.events where id='00000000-0000-0000-0000-00000000e0c1'")
for i in $(seq 1 20); do
  SID=$($P -c "insert into public.staff_accounts (event_id, role, name, access_code, password_hash) values ('00000000-0000-0000-0000-00000000e0c1', 'controller', 'C$i', 'C$(printf %05d $i)', extensions.crypt('pw', extensions.gen_salt('bf', 4))) returning id" | head -1)
  T=$($P -c "set role anon; select public.staff_login('$SH', '$SID', 'C$(printf %05d $i)', 'pw') ->> 'token'" | tail -1)
  TOKS+=("$T")
  SID2=$($P -c "insert into public.staff_accounts (event_id, role, name, access_code, password_hash) values ('00000000-0000-0000-0000-00000000e0c1', 'server', 'S$i', 'S$(printf %05d $i)', extensions.crypt('pw', extensions.gen_salt('bf', 4))) returning id" | head -1)
  T2=$($P -c "set role anon; select public.staff_login('$SH', '$SID2', 'S$(printf %05d $i)', 'pw') ->> 'token'" | tail -1)
  STOKS+=("$T2")
done
rm -f /tmp/conc_*.out
for i in $(seq 0 19); do
  ( $P -c "set role anon; select pg_sleep(0.3 - extract(milliseconds from clock_timestamp())::int % 300 / 1000.0); select public.staff_confirm_entry('${TOKS[$i]}', '00000000-0000-0000-0000-0000000000f1') ->> 'status'" | tail -1 > /tmp/conc_e$i.out ) &
  ( $P -c "set role anon; select pg_sleep(0.3 - extract(milliseconds from clock_timestamp())::int % 300 / 1000.0); select public.staff_mark_served('${STOKS[$i]}', '00000000-0000-0000-0000-0000000000f1', 'drink') ->> 'status'" | tail -1 > /tmp/conc_s$i.out ) &
done
wait
CE=$(cat /tmp/conc_e*.out | grep -c '^confirmed$'); AE=$(cat /tmp/conc_e*.out | grep -c '^already$')
CS=$(cat /tmp/conc_s*.out | grep -c '^served$'); AS=$(cat /tmp/conc_s*.out | grep -c '^already$')
RE=$($P -c "select count(*) from public.entries where guest_id='00000000-0000-0000-0000-0000000000f1'")
RS=$($P -c "select count(*) || '/' || coalesce(sum(units),0) from public.services where guest_id='00000000-0000-0000-0000-0000000000f1'")
PR=$($P -c "select (public.event_stats('00000000-0000-0000-0000-00000000e0c1')) -> 'drinks' ->> 'served'" -v x=1 2>/dev/null)
echo "entrées : $CE confirmée(s), $AE « déjà validée », lignes en base : $RE"
echo "boissons : $CS servie(s), $AS « déjà servie », lignes/unités en base : $RS"
if [ "$CE" = 1 ] && [ "$AE" = 19 ] && [ "$RE" = 1 ] && [ "$CS" = 1 ] && [ "$AS" = 19 ] && [ "$RS" = "1/2" ]; then echo "OK   20 validations simultanées : une seule entrée, une seule prestation (2 boissons pour le couple)"; else echo "ÉCHEC concurrence"; exit 1; fi
