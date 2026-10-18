-- =====================================================================
-- Application organisateur : photos, règlement, envoi des invitations,
-- écrans du personnel, page Service partagée par lien.
-- =====================================================================

-- ---------- photos de l'invitation (1 à 4, facultatives) ----------
alter table public.events add column photos text[] not null default '{}'
  check (coalesce(array_length(photos, 1), 0) <= 4);
grant insert (photos) on public.events to authenticated;
grant update (photos) on public.events to authenticated;

-- Stockage Supabase : dossier = identifiant de l'événement ; écriture réservée à qui peut modifier l'événement.
-- Lecture publique : l'identifiant interne (uuid) n'est jamais exposé aux invités, seuls les chemins des photos le sont.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    execute $p$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('event-photos', 'event-photos', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
      on conflict (id) do nothing$p$;
    execute $p$create policy event_photos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'event-photos' and private.can_write_event(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy event_photos_update on storage.objects for update to authenticated
      using (bucket_id = 'event-photos' and private.can_write_event(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy event_photos_delete on storage.objects for delete to authenticated
      using (bucket_id = 'event-photos' and private.can_write_event(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

-- ---------- règlement : même calcul que create_checkout ----------
create or replace function public.event_billing(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; persons int; units int; due int; paid int; pending int;
begin
  if not private.can_read_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  select value into pr from public.settings where key = 'pricing';
  select greatest(e.expected, coalesce(sum(seats), 0)) into persons from public.guests where event_id = e.id;
  units := ceil(greatest(persons, 1)::numeric / (pr ->> 'unit_persons')::int);
  due := case when e.billing = 'free_admin' then 0 else units * (pr ->> 'unit_cents')::int end;
  select coalesce(sum(amount_cents) filter (where status = 'succeeded'), 0), coalesce(sum(amount_cents) filter (where status = 'pending'), 0)
    into paid, pending from public.transactions where event_id = e.id;
  return jsonb_build_object('free', e.billing = 'free_admin', 'persons', persons, 'units', units,
    'unit_cents', (pr ->> 'unit_cents')::int, 'unit_persons', (pr ->> 'unit_persons')::int, 'currency', pr ->> 'currency',
    'due_cents', due, 'paid_cents', paid, 'pending_cents', pending, 'remaining_cents', greatest(0, due - paid),
    'can_send', e.billing = 'free_admin' or paid >= due);
end $$;

-- un événement payant n'ouvre ses invitations qu'après un premier paiement confirmé
create or replace function private.invitations_open(e public.events) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select e.status = 'active' and (e.billing = 'free_admin'
    or exists (select 1 from public.transactions t where t.event_id = e.id and t.status = 'succeeded'))
$$;

create or replace function public.get_invitation(p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'event', jsonb_build_object('type', e.type, 'host_a', e.host_a, 'host_b', e.host_b, 'title', e.title, 'date', e.event_date, 'time', e.event_time,
      'venue', e.venue, 'address', e.address, 'dress', e.dress, 'message', e.message, 'program', e.program, 'offer', e.offer, 'short_id', e.short_id,
      'photos', to_jsonb(e.photos)),
    'guest', jsonb_build_object('name', g.name, 'kind', g.kind, 'seats', g.seats, 'table', g.table_no, 'rsvp', g.rsvp, 'code', g.code,
      'qr', 'CRM2:' || g.invite_token,
      'entered_at', (select confirmed_at from public.entries where guest_id = g.id)),
    'order', (select jsonb_build_object('drinks', o.drinks, 'dishes', o.dishes) from public.guest_orders o where o.guest_id = g.id),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name) order by c.created_at), '[]') from public.catalog_items c where c.event_id = e.id))
  from public.guests g join public.events e on e.id = g.event_id
  where g.invite_token = p_token and private.invitations_open(e)
$$;

create or replace function public.submit_rsvp(p_token text, p_answer public.rsvp_answer, p_drinks uuid[] default '{}', p_dishes uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.guests; e public.events; need_d boolean; need_f boolean;
begin
  select * into g from public.guests where invite_token = p_token;
  if not found then raise exception 'Invitation introuvable.' using errcode = 'P0002'; end if;
  select * into e from public.events where id = g.event_id;
  if not private.invitations_open(e) then raise exception 'Cet événement n''est pas disponible.' using errcode = '42501'; end if;
  if exists (select 1 from public.entries where guest_id = g.id) then
    raise exception 'Votre entrée a déjà été validée : la réponse ne peut plus être modifiée.' using errcode = '42501';
  end if;
  if p_answer = 'no' then
    update public.guests set rsvp = 'no', rsvp_at = now() where id = g.id;
    delete from public.guest_orders where guest_id = g.id;
    return jsonb_build_object('ok', true);
  end if;
  need_d := e.offer in ('both', 'drinks');
  need_f := e.offer in ('both', 'food');
  if need_d and (coalesce(array_length(p_drinks, 1), 0) <> g.seats or exists (
       select 1 from unnest(p_drinks) i where not exists (select 1 from public.catalog_items c where c.id = i and c.event_id = e.id and c.kind = 'drink'))) then
    raise exception 'Choisissez une boisson proposée pour chaque personne.' using errcode = '22023';
  end if;
  if need_f and (coalesce(array_length(p_dishes, 1), 0) <> g.seats or exists (
       select 1 from unnest(p_dishes) i where not exists (select 1 from public.catalog_items c where c.id = i and c.event_id = e.id and c.kind = 'dish'))) then
    raise exception 'Choisissez un plat proposé pour chaque personne.' using errcode = '22023';
  end if;
  update public.guests set rsvp = 'yes', rsvp_at = now() where id = g.id;
  if need_d or need_f then
    insert into public.guest_orders (guest_id, event_id, drinks, dishes)
    values (g.id, e.id, case when need_d then p_drinks else '{}' end, case when need_f then p_dishes else '{}' end)
    on conflict (guest_id) do update set drinks = excluded.drinks, dishes = excluded.dishes, updated_at = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- envoi : marque les invitations ouvertes dans WhatsApp (règlement exigé) ----------
create or replace function public.mark_invitations_sent(p_event uuid, p_guests uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b jsonb; n int;
begin
  if not private.can_write_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  b := public.event_billing(p_event);
  if not (b ->> 'can_send')::boolean then
    raise exception 'Réglez d''abord le montant restant pour envoyer les invitations.' using errcode = '42501';
  end if;
  update public.guests set whatsapp_opened_at = now() where event_id = p_event and id = any(p_guests);
  get diagnostics n = row_count;
  if n > 0 then perform private.event_log(p_event, private.actor_label(), n || ' invitation(s) envoyée(s) sur WhatsApp'); end if;
  return jsonb_build_object('ok', true, 'marked', n);
end $$;

-- ---------- lien du personnel de service : commandes par table, sans aucun nom ----------
create or replace function public.service_board(p_short text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  select * into e from public.events where short_id = p_short and status = 'active';
  if not found or p_key is null or p_key <> e.service_key then return null; end if;
  return jsonb_build_object('title', e.title, 'offer', e.offer, 'tables', private.table_count(e.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('table', t, 'kind', k, 'item', name, 'qty', q) order by t, k, q desc)
      from (
        select coalesce(g.table_no, 0) t, c.kind::text k, c.name, count(*) q
        from public.guests g join public.guest_orders o on o.guest_id = g.id
        cross join lateral unnest(o.drinks || o.dishes) as item_id
        join public.catalog_items c on c.id = item_id
        where g.event_id = e.id and g.rsvp = 'yes'
        group by 1, 2, 3) x), '[]'::jsonb));
end $$;

create or replace function public.rotate_service_key(p_event uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare k text := private.short_id(10);
begin
  if not private.can_write_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  update public.events set service_key = k where id = p_event;
  perform private.event_log(p_event, private.actor_label(), 'Lien du service renouvelé : l''ancien lien ne fonctionne plus');
  return k;
end $$;

-- ---------- écrans du personnel : compteurs (aucun nom pour le serveur) ----------
create or replace function public.staff_overview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts; e public.events; st jsonb;
begin
  s := private.staff_session(p_token);
  select * into e from public.events where id = s.event_id;
  if s.role = 'controller' then
    return jsonb_build_object('role', 'controller', 'name', s.name, 'event_title', e.title,
      'entered_persons', (select coalesce(sum(persons), 0) from public.entries where event_id = e.id),
      'expected_persons', (select coalesce(sum(seats), 0) from public.guests where event_id = e.id and rsvp = 'yes'),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'persons', en.persons, 'at', en.confirmed_at) order by en.confirmed_at desc), '[]')
                   from (select * from public.entries where event_id = e.id order by confirmed_at desc limit 5) en join public.guests g on g.id = en.guest_id));
  end if;
  st := private.event_totals(e.id);
  return jsonb_build_object('role', 'server', 'name', s.name, 'event_title', e.title, 'offer', e.offer,
    'drinks', jsonb_build_object('planned', st -> 'drinks' -> 'planned', 'served', st -> 'drinks' -> 'served'),
    'dishes', jsonb_build_object('planned', st -> 'dishes' -> 'planned', 'served', st -> 'dishes' -> 'served'));
end $$;

-- totaux prévus / servis (sans contrôle d'accès : appelée uniquement par des fonctions qui l'ont fait)
create or replace function private.event_totals(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with g as (
    select g.id, o.drinks, o.dishes from public.guests g left join public.guest_orders o on o.guest_id = g.id
    where g.event_id = p_event and g.rsvp = 'yes'
  )
  select jsonb_build_object(
    'drinks', jsonb_build_object(
      'planned', coalesce(sum(coalesce(array_length(drinks, 1), 0)), 0),
      'served', coalesce(sum(case when exists (select 1 from public.services s where s.guest_id = g.id and s.kind = 'drink') then coalesce(array_length(drinks, 1), 0) else 0 end), 0)),
    'dishes', jsonb_build_object(
      'planned', coalesce(sum(coalesce(array_length(dishes, 1), 0)), 0),
      'served', coalesce(sum(case when exists (select 1 from public.services s where s.guest_id = g.id and s.kind = 'dish') then coalesce(array_length(dishes, 1), 0) else 0 end), 0)))
  from g
$$;

-- tarif public (affiché aux organisateurs avant création ; les autres paramètres restent réservés à l'administration)
create or replace function public.public_pricing()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select value from public.settings where key = 'pricing'
$$;

-- ---------- droits ----------
revoke execute on function public.event_billing(uuid), public.mark_invitations_sent(uuid, uuid[]), public.service_board(text, text),
  public.rotate_service_key(uuid), public.staff_overview(text) from public, anon, authenticated;
revoke execute on function private.event_totals(uuid) from public, anon, authenticated;
revoke execute on function private.invitations_open(public.events) from public, anon, authenticated;
grant execute on function public.event_billing(uuid), public.mark_invitations_sent(uuid, uuid[]), public.rotate_service_key(uuid) to authenticated;
grant execute on function public.service_board(text, text), public.staff_overview(text) to anon, authenticated;
grant execute on function public.get_invitation(text), public.submit_rsvp(text, public.rsvp_answer, uuid[], uuid[]) to anon, authenticated;
revoke execute on function public.public_pricing() from public;
grant execute on function public.public_pricing() to anon, authenticated;
