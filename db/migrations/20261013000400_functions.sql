-- =====================================================================
-- Fonctions métier : organisateur, invité, contrôleur, serveur
-- Toutes les vérifications de droits sont faites ici, côté serveur.
-- =====================================================================

-- ---------- plan de table : appliqué d'un seul coup, capacités vérifiées par le déclencheur ----------
create or replace function public.save_table_plan(p_event uuid, p_plan jsonb, p_manual boolean default true, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not private.can_write_event(p_event) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Plan invalide.' using errcode = '22023';
  end if;
  update public.guests g
     set table_no = nullif((p_plan ->> g.id::text)::int, 0),
         placed_manually = p_manual and nullif((p_plan ->> g.id::text)::int, 0) is not null
   where g.event_id = p_event and p_plan ? g.id::text;
  get diagnostics n = row_count;
  perform private.event_log(p_event, private.actor_label(), coalesce(p_label, n || ' placement(s) enregistré(s)'));
  if private.admin_role() is not null then
    perform private.audit('event.table_plan', 'event', p_event::text, 'success', jsonb_build_object('count', n));
  end if;
  return jsonb_build_object('ok', true, 'updated', n);
end $$;

-- ---------- accès du jour J (créés par l'organisateur ou un admin autorisé) ----------
create or replace function private.new_access_code(p_event uuid) returns text
language plpgsql volatile as $$
declare c text; alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea;
begin
  loop
    b := extensions.gen_random_bytes(6); c := '';
    for i in 0..5 loop c := c || substr(alphabet, 1 + get_byte(b, i) % length(alphabet), 1); end loop;
    exit when not exists (select 1 from public.staff_accounts where event_id = p_event and access_code = c);
  end loop;
  return c;
end $$;

create or replace function public.create_staff(p_event uuid, p_role public.staff_role, p_name text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid; v_code text; lim jsonb; n int;
begin
  if not private.can_write_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  if char_length(coalesce(trim(p_name), '')) not between 1 and 60 then raise exception 'Nom invalide.' using errcode = '22023'; end if;
  if char_length(coalesce(p_password, '')) not between 6 and 64 then raise exception 'Le mot de passe doit contenir entre 6 et 64 caractères.' using errcode = '22023'; end if;
  select value into lim from public.settings where key = 'staff_limits';
  select count(*) into n from public.staff_accounts where event_id = p_event and role = p_role;
  if n >= coalesce((lim ->> case when p_role = 'controller' then 'max_controllers' else 'max_servers' end)::int, 10) then
    raise exception 'Nombre maximum d''accès atteint pour ce rôle.' using errcode = '23514';
  end if;
  v_code := private.new_access_code(p_event);
  insert into public.staff_accounts (event_id, role, name, access_code, password_hash, created_by)
  values (p_event, p_role, trim(p_name), v_code, crypt(p_password, gen_salt('bf', 10)), auth.uid())
  returning id into v_id;
  perform private.event_log(p_event, private.actor_label(), (case when p_role = 'controller' then 'Contrôleur' else 'Serveur' end) || ' créé : ' || trim(p_name));
  if private.admin_role() is not null then perform private.audit('staff.create', 'staff', v_id::text, 'success', jsonb_build_object('event', p_event, 'role', p_role)); end if;
  return jsonb_build_object('id', v_id, 'access_code', v_code);
end $$;

create or replace function public.set_staff_revoked(p_staff uuid, p_revoked boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts;
begin
  select * into s from public.staff_accounts where id = p_staff;
  if not found or not private.can_write_event(s.event_id) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  update public.staff_accounts set revoked = p_revoked, session_version = session_version + 1 where id = p_staff;
  delete from public.staff_sessions where staff_id = p_staff;
  perform private.event_log(s.event_id, private.actor_label(), 'Accès ' || case when p_revoked then 'révoqué' else 'rétabli' end || ' : ' || s.name);
end $$;

create or replace function public.reset_staff_password(p_staff uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s public.staff_accounts;
begin
  select * into s from public.staff_accounts where id = p_staff;
  if not found or not private.can_write_event(s.event_id) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  if char_length(coalesce(p_password, '')) not between 6 and 64 then raise exception 'Le mot de passe doit contenir entre 6 et 64 caractères.' using errcode = '22023'; end if;
  update public.staff_accounts set password_hash = crypt(p_password, gen_salt('bf', 10)), session_version = session_version + 1,
         failed_attempts = 0, locked_until = null where id = p_staff;
  delete from public.staff_sessions where staff_id = p_staff;
  perform private.event_log(s.event_id, private.actor_label(), 'Nouveau mot de passe : ' || s.name);
end $$;

create or replace function public.delete_staff(p_staff uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts;
begin
  select * into s from public.staff_accounts where id = p_staff;
  if not found or not private.can_write_event(s.event_id) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  delete from public.staff_accounts where id = p_staff;
  perform private.event_log(s.event_id, private.actor_label(), 'Accès supprimé : ' || s.name);
end $$;

-- ---------- statistiques (agrégées, sans nom ni choix individuel) ----------
create or replace function public.event_stats(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  if not private.can_read_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
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

-- commandes par table pour la page Service (quantités par produit, sans nom)
create or replace function public.service_totals(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not private.can_read_event(p_event) then null else coalesce((
    select jsonb_agg(jsonb_build_object('table', t, 'kind', k, 'item', name, 'qty', q) order by t, k, q desc)
    from (
      select coalesce(g.table_no, 0) t, c.kind::text k, c.name, count(*) q
      from public.guests g
      join public.guest_orders o on o.guest_id = g.id
      cross join lateral unnest(o.drinks || o.dishes) as item_id
      join public.catalog_items c on c.id = item_id
      where g.event_id = p_event and g.rsvp = 'yes'
      group by 1, 2, 3
    ) x), '[]'::jsonb) end
$$;

-- ---------- invité (lien personnel, sans compte) ----------
create or replace function public.get_invitation(p_token text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'event', jsonb_build_object('type', e.type, 'host_a', e.host_a, 'host_b', e.host_b, 'title', e.title, 'date', e.event_date, 'time', e.event_time,
      'venue', e.venue, 'address', e.address, 'dress', e.dress, 'message', e.message, 'program', e.program, 'offer', e.offer, 'short_id', e.short_id),
    'guest', jsonb_build_object('name', g.name, 'kind', g.kind, 'seats', g.seats, 'table', g.table_no, 'rsvp', g.rsvp, 'code', g.code,
      'qr', 'CRM2:' || g.invite_token,
      'entered_at', (select confirmed_at from public.entries where guest_id = g.id)),
    'order', (select jsonb_build_object('drinks', o.drinks, 'dishes', o.dishes) from public.guest_orders o where o.guest_id = g.id),
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name) order by c.created_at), '[]') from public.catalog_items c where c.event_id = e.id))
  from public.guests g join public.events e on e.id = g.event_id
  where g.invite_token = p_token and e.status = 'active'
$$;

create or replace function public.submit_rsvp(p_token text, p_answer public.rsvp_answer, p_drinks uuid[] default '{}', p_dishes uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.guests; e public.events; need_d boolean; need_f boolean;
begin
  select * into g from public.guests where invite_token = p_token;
  if not found then raise exception 'Invitation introuvable.' using errcode = 'P0002'; end if;
  select * into e from public.events where id = g.event_id;
  if e.status <> 'active' then raise exception 'Cet événement n''est pas disponible.' using errcode = '42501'; end if;
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

-- ---------- personnel du jour J ----------
create or replace function public.staff_login(p_event_short text, p_staff uuid, p_code text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s public.staff_accounts; e public.events; tok text; ok boolean;
begin
  select st.* into s from public.staff_accounts st join public.events ev on ev.id = st.event_id
   where st.id = p_staff and ev.short_id = p_event_short for update of st;
  if not found then return jsonb_build_object('ok', false, 'error', 'Accès introuvable.'); end if;
  select * into e from public.events where id = s.event_id;
  if e.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'Cet événement n''est pas disponible.'); end if;
  if s.revoked then return jsonb_build_object('ok', false, 'error', 'Cet accès a été révoqué par l''organisateur.'); end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Trop de tentatives. Réessayez dans ' || ceil(extract(epoch from s.locked_until - now()) / 60) || ' min.');
  end if;
  ok := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) = s.access_code and s.password_hash = crypt(coalesce(p_password, ''), s.password_hash);
  if not ok then
    update public.staff_accounts
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else locked_until end
     where id = s.id;
    perform private.audit('staff.login', 'staff', s.id::text, 'denied', jsonb_build_object('event', s.event_id));
    return jsonb_build_object('ok', false, 'error', case when s.failed_attempts + 1 >= 5 then 'Trop de tentatives. L''accès est bloqué pendant 5 minutes.' else 'Code ou mot de passe incorrect.' end);
  end if;
  tok := private.token(24);
  insert into public.staff_sessions (token_hash, staff_id, session_version, expires_at)
  values (encode(digest(tok, 'sha256'), 'hex'), s.id, s.session_version, now() + interval '12 hours');
  update public.staff_accounts set failed_attempts = 0, locked_until = null, last_login_at = now() where id = s.id;
  return jsonb_build_object('ok', true, 'token', tok, 'role', s.role, 'name', s.name, 'event_title', e.title, 'expires_in', 43200);
end $$;

create or replace function private.staff_session(p_token text)
returns public.staff_accounts language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare s public.staff_accounts;
begin
  select st.* into s
    from public.staff_sessions ss
    join public.staff_accounts st on st.id = ss.staff_id
    join public.events e on e.id = st.event_id
   where ss.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and ss.expires_at > now() and ss.session_version = st.session_version
     and not st.revoked and e.status = 'active';
  if not found then raise exception 'Session expirée ou accès révoqué. Reconnectez-vous.' using errcode = '28000'; end if;
  return s;
end $$;

create or replace function private.find_guest(p_event uuid, p_scan text) returns public.guests
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g public.guests; s text := trim(coalesce(p_scan, ''));
begin
  if s ~* '^CRM2:' then
    select * into g from public.guests where invite_token = substr(s, 6);
  else
    select * into g from public.guests where event_id = p_event and code = upper(regexp_replace(s, '\s', '', 'g'));
  end if;
  if not found then raise exception 'Invitation invalide : code inconnu.' using errcode = 'P0002'; end if;
  if g.event_id <> p_event then raise exception 'Invitation invalide : elle appartient à un autre événement.' using errcode = '42501'; end if;
  return g;
end $$;

create or replace function public.staff_lookup(p_token text, p_scan text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts; g public.guests; o public.guest_orders; en public.entries;
begin
  s := private.staff_session(p_token);
  g := private.find_guest(s.event_id, p_scan);
  if s.role = 'controller' then
    select * into en from public.entries where guest_id = g.id;
    return jsonb_build_object('guest_id', g.id, 'name', g.name, 'persons', g.seats, 'table', g.table_no, 'rsvp', g.rsvp,
      'entered_at', en.confirmed_at, 'entered_by', en.staff_name,
      'valid', g.rsvp = 'yes' and en.guest_id is null);
  end if;
  select * into o from public.guest_orders where guest_id = g.id;
  return jsonb_build_object('guest_id', g.id, 'name', g.name, 'table', g.table_no, 'confirmed', g.rsvp = 'yes',
    'drinks', case when g.rsvp = 'yes' then (select coalesce(jsonb_agg(c.name order by ord), '[]') from unnest(o.drinks) with ordinality u(i, ord) join public.catalog_items c on c.id = u.i) else '[]'::jsonb end,
    'dishes', case when g.rsvp = 'yes' then (select coalesce(jsonb_agg(c.name order by ord), '[]') from unnest(o.dishes) with ordinality u(i, ord) join public.catalog_items c on c.id = u.i) else '[]'::jsonb end,
    'drink_served', (select jsonb_build_object('at', served_at, 'by', staff_name) from public.services where guest_id = g.id and kind = 'drink'),
    'dish_served', (select jsonb_build_object('at', served_at, 'by', staff_name) from public.services where guest_id = g.id and kind = 'dish'));
end $$;

-- Confirmation d'entrée : la clé primaire de "entries" garantit une seule validation, même simultanée.
create or replace function public.staff_confirm_entry(p_token text, p_guest uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts; g public.guests; en public.entries; inserted boolean;
begin
  s := private.staff_session(p_token);
  if s.role <> 'controller' then raise exception 'Seul un contrôleur peut confirmer une entrée.' using errcode = '42501'; end if;
  select * into g from public.guests where id = p_guest and event_id = s.event_id;
  if not found then raise exception 'Invitation invalide.' using errcode = 'P0002'; end if;
  if g.rsvp is distinct from 'yes' then
    return jsonb_build_object('ok', false, 'status', 'unconfirmed', 'message', 'La présence n''a pas été confirmée.');
  end if;
  insert into public.entries (guest_id, event_id, staff_id, staff_name, persons)
  values (g.id, g.event_id, s.id, s.name, g.seats)
  on conflict (guest_id) do nothing;
  get diagnostics inserted = row_count;
  select * into en from public.entries where guest_id = g.id;
  if inserted then
    perform private.event_log(g.event_id, s.name, 'Entrée confirmée : ' || g.name);
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'at', en.confirmed_at, 'table', g.table_no, 'persons', g.seats, 'name', g.name);
  end if;
  return jsonb_build_object('ok', false, 'status', 'already', 'at', en.confirmed_at, 'by', en.staff_name, 'name', g.name);
end $$;

create or replace function public.staff_mark_served(p_token text, p_guest uuid, p_kind public.service_kind)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts; g public.guests; o public.guest_orders; n int; inserted boolean; sv public.services;
begin
  s := private.staff_session(p_token);
  if s.role <> 'server' then raise exception 'Seul un serveur peut enregistrer une prestation.' using errcode = '42501'; end if;
  select * into g from public.guests where id = p_guest and event_id = s.event_id;
  if not found then raise exception 'Invitation invalide.' using errcode = 'P0002'; end if;
  select * into o from public.guest_orders where guest_id = g.id;
  n := coalesce(array_length(case when p_kind = 'drink' then o.drinks else o.dishes end, 1), 0);
  if g.rsvp is distinct from 'yes' or n = 0 then
    return jsonb_build_object('ok', false, 'status', 'nothing', 'message', 'Aucune commande de ce type pour cet invité.');
  end if;
  insert into public.services (guest_id, kind, event_id, staff_id, staff_name, units)
  values (g.id, p_kind, g.event_id, s.id, s.name, n)
  on conflict (guest_id, kind) do nothing;
  get diagnostics inserted = row_count;
  select * into sv from public.services where guest_id = g.id and kind = p_kind;
  if inserted then
    perform private.event_log(g.event_id, s.name, case when p_kind = 'drink' then 'Boisson servie : ' else 'Plat servi : ' end || g.name);
  end if;
  return jsonb_build_object('ok', inserted, 'status', case when inserted then 'served' else 'already' end, 'at', sv.served_at, 'by', sv.staff_name);
end $$;

create or replace function public.staff_logout(p_token text)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  delete from public.staff_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- ---------- paiement : montant calculé côté serveur ----------
create or replace function public.create_checkout(p_event uuid, p_method public.tx_method, p_provider text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; persons int; units int; amount int; paid int; tx public.transactions;
begin
  select * into e from public.events where id = p_event;
  if not found or e.owner_id is distinct from auth.uid() or e.billing <> 'paid' or e.status <> 'active' then
    raise exception 'Paiement impossible pour cet événement.' using errcode = '42501';
  end if;
  if p_provider not in ('stripe', 'cinetpay') or (p_method = 'card' and p_provider <> 'stripe') or (p_method = 'mobile_money' and p_provider <> 'cinetpay') then
    raise exception 'Moyen de paiement invalide.' using errcode = '22023';
  end if;
  select value into pr from public.settings where key = 'pricing';
  select greatest(e.expected, coalesce(sum(seats), 0)) into persons from public.guests where event_id = e.id;
  units := ceil(greatest(persons, 1)::numeric / (pr ->> 'unit_persons')::int);
  select coalesce(sum(amount_cents) filter (where status = 'succeeded'), 0) into paid from public.transactions where event_id = e.id;
  amount := units * (pr ->> 'unit_cents')::int - paid;
  if amount <= 0 then return jsonb_build_object('ok', false, 'error', 'Rien à régler.'); end if;
  insert into public.transactions (event_id, organizer_id, event_snapshot, persons, amount_cents, currency, method, provider)
  values (e.id, e.owner_id, jsonb_build_object('title', e.title, 'date', e.event_date, 'short_id', e.short_id), persons, amount, pr ->> 'currency', p_method, p_provider)
  returning * into tx;
  return jsonb_build_object('ok', true, 'reference', tx.reference, 'amount_cents', tx.amount_cents, 'currency', tx.currency);
end $$;

-- ---------- droits d'exécution ----------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
-- utilisées par les valeurs par défaut des colonnes (identifiants, jetons)
grant execute on function private.short_id(int), private.token(int) to authenticated, service_role;
grant execute on function private.uid(), private.aal2(), private.admin_role(), private.has_perm(text), private.org_access(uuid, boolean),
  private.can_read_event(uuid), private.can_write_event(uuid) to authenticated;
grant execute on function public.save_table_plan(uuid, jsonb, boolean, text), public.create_staff(uuid, public.staff_role, text, text),
  public.set_staff_revoked(uuid, boolean), public.reset_staff_password(uuid, text), public.delete_staff(uuid),
  public.event_stats(uuid), public.service_totals(uuid), public.create_checkout(uuid, public.tx_method, text) to authenticated;
-- invités et personnel n'ont pas de compte : fonctions ouvertes, protégées par jeton
grant execute on function public.get_invitation(text), public.submit_rsvp(text, public.rsvp_answer, uuid[], uuid[]),
  public.staff_login(text, uuid, text, text), public.staff_lookup(text, text), public.staff_confirm_entry(text, uuid),
  public.staff_mark_served(text, uuid, public.service_kind), public.staff_logout(text) to anon, authenticated;
