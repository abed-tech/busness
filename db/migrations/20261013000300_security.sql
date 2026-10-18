-- =====================================================================
-- Fonctions d'autorisation, règles RLS, contrôles d'intégrité
-- =====================================================================

-- ---------- identité ----------
create or replace function private.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

-- Authentification multifacteur exigée pour toute action d'administration.
create or replace function private.aal2() returns boolean
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;

create or replace function private.admin_role() returns public.admin_role
language sql stable security definer set search_path = public, pg_temp as $$
  select a.role from public.admin_users a where a.user_id = auth.uid() and a.active
$$;

create or replace function private.has_perm(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.aal2() and exists (
    select 1 from public.admin_users a
    join public.role_permissions r on r.role = a.role
    where a.user_id = auth.uid() and a.active and r.perm = p
  )
$$;

-- Accès organisateur : propriétaire, ou organisateur associé autorisé à gérer.
-- Un compte suspendu peut consulter mais plus modifier ; un événement suspendu est en lecture seule.
create or replace function private.org_access(p_event uuid, p_write boolean) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.events e
    join public.profiles pr on pr.id = auth.uid()
    where e.id = p_event
      and e.status <> 'deleted'
      and (e.owner_id = auth.uid() or (e.organizer_id = auth.uid() and e.organizer_can_manage))
      and (not p_write or (e.status = 'active' and pr.status = 'active'))
  )
$$;

create or replace function private.can_read_event(p_event uuid) returns boolean
language sql stable as $$ select private.org_access(p_event, false) or private.has_perm('events.read') $$;

create or replace function private.can_write_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select private.org_access(p_event, true)
      or (private.has_perm('events.write') and exists (select 1 from public.events where id = p_event and status <> 'deleted'))
$$;

create or replace function private.actor_label() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select display_name from public.admin_users where user_id = auth.uid()),
    (select username from public.profiles where id = auth.uid()),
    'système')
$$;

create or replace function private.audit(p_action text, p_object_type text, p_object_id text, p_result text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_log (actor_id, actor_label, actor_role, action, object_type, object_id, result, details)
  values (auth.uid(), private.actor_label(),
          coalesce((select role::text from public.admin_users where user_id = auth.uid()), case when auth.uid() is null then 'system' else 'organizer' end),
          p_action, p_object_type, p_object_id, p_result, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function private.event_log(p_event uuid, p_actor text, p_message text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.event_log (event_id, actor, message) values (p_event, left(p_actor, 80), left(p_message, 300))
$$;

-- ---------- tables : capacité jamais dépassée, couples jamais séparés ----------
create or replace function private.table_count(p_event uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(1, ceil(greatest(coalesce((select sum(seats) from public.guests where event_id = e.id), 0), e.expected)::numeric / e.table_capacity)::int) + e.extra_tables
  from public.events e where e.id = p_event
$$;

create or replace function private.check_table_loads()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
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
create trigger guests_capacity_ins after insert on public.guests
  referencing new table as new_rows for each statement execute function private.check_table_loads();
create trigger guests_capacity_upd after update on public.guests
  referencing new table as new_rows for each statement execute function private.check_table_loads();

create or replace function private.check_event_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if new.table_capacity is distinct from old.table_capacity or new.expected is distinct from old.expected or new.extra_tables is distinct from old.extra_tables then
    if new.table_capacity < 2 and exists (select 1 from public.guests where event_id = new.id and kind = 'couple') then
      raise exception 'Une table d''une seule place ne peut pas accueillir de couple.' using errcode = '23514';
    end if;
    select table_no, sum(seats) as used into r from public.guests where event_id = new.id and table_no is not null
      group by table_no having sum(seats) > new.table_capacity limit 1;
    if found then
      raise exception 'La table % serait trop pleine (% personnes) avec % places.', r.table_no, r.used, new.table_capacity using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger events_capacity after update on public.events
  for each row execute function private.check_event_capacity();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.role_permissions enable row level security;
alter table public.settings enable row level security;
alter table public.events enable row level security;
alter table public.guests enable row level security;
alter table public.catalog_items enable row level security;
alter table public.guest_orders enable row level security;
alter table public.staff_accounts enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.entries enable row level security;
alter table public.services enable row level security;
alter table public.event_log enable row level security;
alter table public.transactions enable row level security;
alter table public.payment_events enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.admin_login_attempts enable row level security;

-- Par défaut, aucun accès direct ; on ouvre table par table.
revoke all on all tables in schema public from anon, authenticated;

-- profils
grant select on public.profiles to authenticated;
grant insert (id, username, full_name, phone, email) on public.profiles to authenticated;
grant update (username, full_name, phone, tutorials) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.has_perm('organizers.read'));
create policy profiles_self_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- administrateurs, permissions, paramètres (lecture seulement ; écritures par fonctions)
grant select on public.admin_users, public.role_permissions, public.settings to authenticated;
create policy admin_users_read on public.admin_users for select to authenticated
  using (user_id = auth.uid() or private.has_perm('admins.manage'));
create policy role_permissions_read on public.role_permissions for select to authenticated
  using (private.admin_role() is not null);
create policy settings_read on public.settings for select to authenticated
  using (private.has_perm('dashboard.read'));

-- événements
grant select on public.events to authenticated;
grant insert (owner_id, type, host_a, host_b, title, event_date, event_time, venue, address, dress, message, program, expected, table_capacity, phone_prefix, offer) on public.events to authenticated;
grant update (type, host_a, host_b, title, event_date, event_time, venue, address, dress, message, program, expected, table_capacity, extra_tables, phone_prefix, offer) on public.events to authenticated;
create policy events_read on public.events for select to authenticated
  using (private.can_read_event(id));
create policy events_insert_organizer on public.events for insert to authenticated
  with check (owner_id = auth.uid() and origin = 'organizer' and billing = 'paid'
              and exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
create policy events_update on public.events for update to authenticated
  using (private.can_write_event(id)) with check (private.can_write_event(id));

-- invités : données privées, lisibles par l'organisateur et les rôles admin autorisés (guests.read)
grant select, insert, delete on public.guests to authenticated;
grant update (name, kind, whatsapp, table_no, placed_manually) on public.guests to authenticated;
create policy guests_read on public.guests for select to authenticated
  using (private.org_access(event_id, false) or private.has_perm('guests.read'));
create policy guests_insert on public.guests for insert to authenticated
  with check (private.can_write_event(event_id));
create policy guests_update on public.guests for update to authenticated
  using (private.can_write_event(event_id)) with check (private.can_write_event(event_id));
create policy guests_delete on public.guests for delete to authenticated
  using (private.can_write_event(event_id));

-- catalogue
grant select, insert, delete on public.catalog_items to authenticated;
grant update (name) on public.catalog_items to authenticated;
create policy catalog_read on public.catalog_items for select to authenticated using (private.can_read_event(event_id));
create policy catalog_write on public.catalog_items for insert to authenticated with check (private.can_write_event(event_id));
create policy catalog_update on public.catalog_items for update to authenticated using (private.can_write_event(event_id)) with check (private.can_write_event(event_id));
create policy catalog_delete on public.catalog_items for delete to authenticated using (private.can_write_event(event_id));

-- choix individuels : organisateur uniquement (jamais le personnel ni l'administration)
grant select on public.guest_orders to authenticated;
create policy orders_owner_read on public.guest_orders for select to authenticated using (private.org_access(event_id, false));

-- accès du jour J : jamais le mot de passe haché
grant select (id, event_id, role, name, access_code, session_version, revoked, failed_attempts, locked_until, last_login_at, created_at) on public.staff_accounts to authenticated;
create policy staff_read on public.staff_accounts for select to authenticated using (private.can_read_event(event_id));

-- entrées et prestations : lecture seule (écritures par les fonctions du personnel)
grant select on public.entries, public.services to authenticated;
create policy entries_read on public.entries for select to authenticated
  using (private.org_access(event_id, false) or private.has_perm('guests.read'));
create policy services_read on public.services for select to authenticated
  using (private.org_access(event_id, false) or private.has_perm('guests.read'));

grant select on public.event_log to authenticated;
create policy event_log_read on public.event_log for select to authenticated using (private.can_read_event(event_id));

-- finances
grant select on public.transactions to authenticated;
create policy tx_read on public.transactions for select to authenticated
  using (organizer_id = auth.uid() or private.has_perm('finance.read'));
grant select on public.payment_events, public.monthly_reports to authenticated;
create policy payment_events_read on public.payment_events for select to authenticated using (private.has_perm('finance.read'));
create policy monthly_read on public.monthly_reports for select to authenticated using (private.has_perm('finance.read'));

-- journal : lecture par audit.read, aucune écriture directe
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (private.has_perm('audit.read'));

-- staff_sessions, admin_login_attempts : aucun accès client (fonctions uniquement)

-- temps réel (Supabase) : les suivis se mettent à jour à chaque entrée ou prestation
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.entries, public.services, public.guests, public.event_log';
  end if;
end $$;
