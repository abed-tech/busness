-- Capacité des tables garantie même lors d'opérations simultanées (deux organisateurs, deux onglets, deux appareils).
-- Avant : le contrôle (déclencheur guests_capacity_*) comptait les places sans verrou ; deux transactions plaçant chacune
-- un invité à la même table pouvaient toutes deux réussir et dépasser la capacité.
-- Maintenant : l'événement concerné est verrouillé avant le comptage. La seconde transaction attend la première, puis
-- recompte avec ses données validées (READ COMMITTED : chaque requête voit les validations précédentes) et refuse le dépassement.
-- Comportement inchangé par ailleurs (mêmes messages, mêmes règles).
create or replace function private.check_table_loads()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  perform 1 from public.events
   where id in (select distinct n.event_id from new_rows n where n.table_no is not null)
   order by id for update;
  for r in
    select g.event_id, g.table_no, sum(g.seats) as used, e.table_capacity as cap, private.table_count(g.event_id) as tc
    from public.guests g join public.events e on e.id = g.event_id
    where (g.event_id, g.table_no) in (select distinct n.event_id, n.table_no from new_rows n where n.table_no is not null)
    group by g.event_id, g.table_no, e.table_capacity
  loop
    if r.table_no > r.tc then
      raise exception 'La table % n''existe pas : il y a % table(s).', r.table_no, r.tc using errcode = '23514';
    end if;
    if r.used > r.cap then
      raise exception 'La table % dépasserait sa capacité (% personnes pour % places).', r.table_no, r.used, r.cap using errcode = '23514';
    end if;
  end loop;
  return null;
end $$;
revoke execute on function private.check_table_loads() from public, anon, authenticated;
