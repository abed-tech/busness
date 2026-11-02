-- =====================================================================
-- Confidentialité : mêmes restrictions pour tous les administrateurs, administrateur principal compris.
-- Aucun rôle d'administration ne peut lire les invités ni le contenu des invitations, modifier ou supprimer
-- un événement, ni agir dans l'espace d'un organisateur. L'administration garde : comptes administrateurs,
-- paramètres, statistiques, finances, journal, et la suspension motivée et journalisée (procédure d'exception).
-- Aucune donnée d'événement, d'invité ou d'organisateur n'est modifiée ni supprimée par cette migration.
-- =====================================================================

-- ---------- permissions interdites à tout rôle d'administration ----------
create or replace function private.privacy_forbidden(p text) returns boolean
language sql immutable as $$
  select p in ('events.write', 'events.delete', 'guests.read') or p like 'guests.%' or p like 'auth.%' or p like 'impersonate%'
$$;

-- sauvegarde des lignes retirées de la matrice (rien n'est perdu), puis retrait
create table if not exists private.role_permissions_removed (
  role public.admin_role not null,
  perm text not null,
  removed_at timestamptz not null default now(),
  primary key (role, perm)
);
revoke all on private.role_permissions_removed from public, anon, authenticated, service_role;
insert into private.role_permissions_removed (role, perm)
  select role, perm from public.role_permissions where private.privacy_forbidden(perm)
  on conflict do nothing;
delete from public.role_permissions where private.privacy_forbidden(perm);

-- une future migration ne peut pas les rendre à un rôle, quel qu'il soit
create or replace function private.role_permissions_guard() returns trigger
language plpgsql as $$
begin
  if private.privacy_forbidden(new.perm) then
    raise exception 'Permission « % » interdite à tout administrateur (confidentialité des événements et des invités).', new.perm using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists role_permissions_privacy on public.role_permissions;
create trigger role_permissions_privacy before insert or update on public.role_permissions
  for each row execute function private.role_permissions_guard();

-- barrière dans la vérification elle-même : même présente dans la table, une permission interdite reste refusée
create or replace function private.has_perm(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not private.privacy_forbidden(p) and private.aal2() and exists (
    select 1 from public.admin_users a
    join public.role_permissions r on r.role = a.role
    where a.user_id = auth.uid() and a.active and r.perm = p
  )
$$;

-- ---------- lecture et écriture des données d'un événement : organisateur uniquement ----------
create or replace function private.can_read_event(p_event uuid) returns boolean
language sql stable as $$ select private.org_access(p_event, false) $$;

create or replace function private.can_write_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$ select private.org_access(p_event, true) $$;

drop policy if exists guests_read on public.guests;
create policy guests_read on public.guests for select to authenticated using (private.org_access(event_id, false));
drop policy if exists entries_read on public.entries;
create policy entries_read on public.entries for select to authenticated using (private.org_access(event_id, false));
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to authenticated using (private.org_access(event_id, false));

-- refus journalisé, identique pour tous les rôles
create or replace function private.deny_privacy(p_action text, p_type text, p_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.audit(p_action, p_type, p_id, 'denied', jsonb_build_object('rule', 'admin_privacy'));
  return jsonb_build_object('ok', false, 'error', 'forbidden',
    'message', 'Interdit à tout administrateur, y compris l''administrateur principal : les événements et leurs invités appartiennent à l''organisateur.');
end $$;

-- ---------- statistiques agrégées (sans nom ni choix individuel) ----------
-- Même calcul qu'avant, séparé du contrôle d'accès pour que l'administration n'en reçoive que les totaux.
create or replace function private.event_stats_data(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  with g as (
    select g.id, g.seats, g.rsvp, g.table_no, o.drinks, o.dishes
    from public.guests g left join public.guest_orders o on o.guest_id = g.id
    where g.event_id = p_event
  ), d as (
    select coalesce(g.table_no, 0) as t,
           coalesce(array_length(array_remove(g.drinks, null), 1), 0) as planned,
           case when exists (select 1 from public.services s where s.guest_id = g.id and s.kind = 'drink') then coalesce(array_length(array_remove(g.drinks, null), 1), 0) else 0 end as served
    from g where g.rsvp = 'yes'
  ), f as (
    select coalesce(g.table_no, 0) as t,
           coalesce(array_length(array_remove(g.dishes, null), 1), 0) as planned,
           case when exists (select 1 from public.services s where s.guest_id = g.id and s.kind = 'dish') then coalesce(array_length(array_remove(g.dishes, null), 1), 0) else 0 end as served
    from g where g.rsvp = 'yes'
  )
  select jsonb_build_object(
    'invitations', (select count(*) from g),
    'persons', (select coalesce(sum(seats), 0) from g),
    'confirmed_persons', (select coalesce(sum(seats), 0) from g where rsvp = 'yes'),
    'presence', jsonb_build_object(
      'persons', (select coalesce(sum(e.persons), 0) from public.entries e where e.event_id = p_event),
      'invitations', (select count(*) from public.entries e where e.event_id = p_event)),
    'drinks', jsonb_build_object('planned', (select coalesce(sum(planned), 0) from d), 'served', (select coalesce(sum(served), 0) from d),
      'by_table', (select coalesce(jsonb_agg(jsonb_build_object('table', t, 'planned', p, 'served', s) order by t), '[]') from (select t, sum(planned) p, sum(served) s from d group by t having sum(planned) > 0) x)),
    'dishes', jsonb_build_object('planned', (select coalesce(sum(planned), 0) from f), 'served', (select coalesce(sum(served), 0) from f),
      'by_table', (select coalesce(jsonb_agg(jsonb_build_object('table', t, 'planned', p, 'served', s) order by t), '[]') from (select t, sum(planned) p, sum(served) s from f group by t having sum(planned) > 0) x)),
    'tables', private.table_count(p_event)
  ) into res;
  return res;
end $$;

create or replace function public.event_stats(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.can_read_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  return private.event_stats_data(p_event);
end $$;

-- ---------- fiche d'un événement côté administration : métadonnées et totaux seulement ----------
-- Jamais : invités, liens ou QR d'invitation, adresse, message, programme, tenue, prénoms des hôtes, photos,
-- clé du personnel, noms des accès du jour J, coordonnées de l'organisateur (visibles sur sa fiche de compte).
create or replace function public.admin_event_detail(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  if not private.has_perm('events.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true,
    'event', jsonb_build_object('id', e.id, 'short_id', e.short_id, 'title', e.title, 'type', e.type, 'event_date', e.event_date,
      'venue', e.venue, 'status', e.status, 'status_reason', e.status_reason, 'origin', e.origin, 'billing', e.billing,
      'organizer_can_manage', e.organizer_can_manage, 'expected', e.expected, 'table_capacity', e.table_capacity, 'offer', e.offer,
      'created_at', e.created_at, 'activated_at', e.activated_at),
    'owner', (select jsonb_build_object('id', id, 'username', username, 'status', status) from public.profiles where id = e.owner_id),
    'organizer', (select jsonb_build_object('id', id, 'username', username, 'status', status) from public.profiles where id = e.organizer_id),
    'stats', private.event_stats_data(p_event),
    'paid_cents', case when private.has_perm('finance.read') then (select coalesce(sum(amount_cents), 0) from public.transactions where event_id = p_event and status = 'succeeded') end,
    'staff', (select jsonb_build_object('controllers', count(*) filter (where role = 'controller' and not revoked),
                                        'servers', count(*) filter (where role = 'server' and not revoked),
                                        'revoked', count(*) filter (where revoked))
                from public.staff_accounts where event_id = p_event));
end $$;

-- ---------- modification et suppression : refusées à tout administrateur ----------
create or replace function public.admin_update_event(p_event uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.admin_role() is null or not private.aal2() then return private.deny('event.update', 'event', p_event::text, 'events.write'); end if;
  return private.deny_privacy('event.update', 'event', p_event::text);
end $$;

create or replace function public.admin_delete_event(p_event uuid, p_confirm_title text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if private.admin_role() is null or not private.aal2() then return private.deny('event.delete', 'event', p_event::text, 'events.delete'); end if;
  return private.deny_privacy('event.delete', 'event', p_event::text);
end $$;

-- ---------- création gratuite : uniquement pour le compte d'un organisateur, qui le gère seul ----------
-- Un événement « de la plateforme » n'aurait personne pour gérer ses invités : il n'est plus proposé.
-- Les événements de ce type déjà enregistrés restent intacts (invitations et accès du jour J inchangés).
create or replace function public.admin_create_event(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_org uuid; item text;
begin
  if not private.has_perm('events.create') then return private.deny('event.create', 'event', null, 'events.create'); end if;
  perform private.validate_event_payload(p);
  if coalesce(p ->> 'mode', 'for_organizer') <> 'for_organizer' then
    raise exception 'Un événement est toujours créé pour le compte d''un organisateur, qui seul gère ses invités.' using errcode = '22023';
  end if;
  v_org := nullif(p ->> 'organizer_id', '')::uuid;
  if v_org is null or not exists (select 1 from public.profiles where id = v_org) then
    raise exception 'Organisateur introuvable.' using errcode = '22023';
  end if;
  insert into public.events (owner_id, organizer_id, organizer_can_manage, origin, billing, created_by, type, host_a, host_b, title, event_date, event_time,
                             venue, address, dress, message, program, expected, table_capacity, phone_prefix, offer)
  values (null, v_org, true, 'admin_for_organizer', 'free_admin', auth.uid(),
          coalesce(p ->> 'type', 'mariage')::public.event_type, coalesce(p ->> 'host_a', ''), coalesce(p ->> 'host_b', ''), trim(p ->> 'title'),
          (p ->> 'event_date')::date, coalesce((p ->> 'event_time')::time, '16:00'), trim(p ->> 'venue'), trim(p ->> 'address'), coalesce(p ->> 'dress', ''),
          coalesce(p ->> 'message', ''), coalesce(p ->> 'program', ''), coalesce((p ->> 'expected')::int, 0), (p ->> 'table_capacity')::int,
          coalesce(p ->> 'phone_prefix', '+243'), coalesce(p ->> 'offer', 'none')::public.menu_offer)
  returning id into v_id;
  for item in select jsonb_array_elements_text(coalesce(p -> 'drinks', '[]')) loop
    if trim(item) <> '' then insert into public.catalog_items (event_id, kind, name) values (v_id, 'drink', left(trim(item), 80)) on conflict do nothing; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(p -> 'dishes', '[]')) loop
    if trim(item) <> '' then insert into public.catalog_items (event_id, kind, name) values (v_id, 'dish', left(trim(item), 80)) on conflict do nothing; end if;
  end loop;
  perform private.event_log(v_id, private.actor_label(), 'Événement créé par l''administration');
  perform private.audit('event.create', 'event', v_id::text, 'success',
    jsonb_build_object('mode', 'for_organizer', 'organizer_id', v_org, 'billing', 'free_admin', 'title', p ->> 'title'));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------- données d'authentification : jamais accessibles aux rôles clients ----------
revoke all on all tables in schema auth from anon, authenticated, service_role;

-- ---------- droits d'exécution ----------
revoke execute on function private.privacy_forbidden(text), private.role_permissions_guard(), private.deny_privacy(text, text, text),
  private.event_stats_data(uuid) from public, anon, authenticated, service_role;
