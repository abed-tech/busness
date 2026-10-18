-- =====================================================================
-- Fonctions de l'espace administrateur et fonctions système
-- Chaque fonction vérifie la permission, journalise le résultat (y compris
-- les refus) et renvoie {ok:false} plutôt qu'une erreur pour que le refus
-- reste inscrit au journal.
-- =====================================================================

create or replace function private.deny(p_action text, p_type text, p_id text, p_perm text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.audit(p_action, p_type, p_id, 'denied', jsonb_build_object('missing_permission', p_perm, 'aal', coalesce(auth.jwt() ->> 'aal', 'aal1')));
  return jsonb_build_object('ok', false, 'error', 'forbidden', 'message', 'Action non autorisée pour votre rôle.');
end $$;

-- ---------- tableau de bord ----------
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m date := date_trunc('month', now())::date; fin boolean := private.has_perm('finance.read'); res jsonb;
begin
  if not private.has_perm('dashboard.read') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select jsonb_build_object('ok', true,
    'events', jsonb_build_object(
      'total', (select count(*) from public.events where status <> 'deleted'),
      'active', (select count(*) from public.events where status = 'active'),
      'suspended', (select count(*) from public.events where status = 'suspended'),
      'this_month', (select count(*) from public.events where created_at >= m),
      'free_admin', (select count(*) from public.events where billing = 'free_admin' and status <> 'deleted')),
    'organizers', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'suspended', (select count(*) from public.profiles where status = 'suspended'),
      'this_month', (select count(*) from public.profiles where created_at >= m)),
    'finance', case when fin then jsonb_build_object(
      'month', m,
      'revenue_cents', (select coalesce(sum(amount_cents), 0) from public.transactions where status = 'succeeded' and confirmed_at >= m),
      'succeeded', (select count(*) from public.transactions where status = 'succeeded' and confirmed_at >= m),
      'pending', (select count(*) from public.transactions where status = 'pending'),
      'pending_list', (select coalesce(jsonb_agg(x), '[]') from (select reference, amount_cents, currency, method, created_at, event_snapshot ->> 'title' as event from public.transactions where status = 'pending' order by created_at desc limit 5) x),
      'currency', (select value ->> 'currency' from public.settings where key = 'pricing')) else null end,
    'activity', case when private.has_perm('audit.read') then (select coalesce(jsonb_agg(x), '[]') from (select at, actor_label, action, object_type, object_id, result from public.audit_log order by at desc limit 8) x) else null end,
    'alerts', case when private.has_perm('security.read') then jsonb_build_object(
      'failed_admin_logins_24h', (select count(*) from public.admin_login_attempts where not success and at > now() - interval '24 hours'),
      'denied_actions_24h', (select count(*) from public.audit_log where result = 'denied' and at > now() - interval '24 hours'),
      'locked_staff', (select count(*) from public.staff_accounts where locked_until > now()),
      'recent', (select coalesce(jsonb_agg(x), '[]') from (select at, actor_label, action, object_type, details from public.audit_log where result = 'denied' order by at desc limit 5) x)) else null end
  ) into res;
  return res;
end $$;

-- ---------- événements ----------
create or replace function public.admin_list_events(p_search text default '', p_status text default null, p_origin text default null, p_page int default 1, p_size int default 20)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := '%' || lower(coalesce(p_search, '')) || '%'; res jsonb; tot int;
begin
  if not private.has_perm('events.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 100); p_page := greatest(p_page, 1);
  select count(*) into tot from public.events e
   where e.status <> 'deleted' and (p_status is null or e.status::text = p_status) and (p_origin is null or e.origin::text = p_origin)
     and (lower(e.title) like q or lower(e.venue) like q or e.short_id like q);
  select coalesce(jsonb_agg(x), '[]') into res from (
    select e.id, e.short_id, e.title, e.type, e.event_date, e.venue, e.status, e.origin, e.billing, e.created_at,
           coalesce(o.username, a.username) as organizer,
           (select count(*) from public.guests g where g.event_id = e.id) as invitations,
           (select coalesce(sum(seats), 0) from public.guests g where g.event_id = e.id) as persons,
           (select coalesce(sum(persons), 0) from public.entries en where en.event_id = e.id) as present
      from public.events e
      left join public.profiles o on o.id = e.owner_id
      left join public.profiles a on a.id = e.organizer_id
     where e.status <> 'deleted' and (p_status is null or e.status::text = p_status) and (p_origin is null or e.origin::text = p_origin)
       and (lower(e.title) like q or lower(e.venue) like q or e.short_id like q)
     order by e.created_at desc offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', tot, 'page', p_page, 'size', p_size, 'items', res);
end $$;

create or replace function private.validate_event_payload(p jsonb) returns void
language plpgsql immutable as $$
begin
  if coalesce(trim(p ->> 'title'), '') = '' or char_length(p ->> 'title') > 160 then raise exception 'Titre requis (160 caractères maximum).' using errcode = '22023'; end if;
  if (p ->> 'event_date') is null then raise exception 'Date requise.' using errcode = '22023'; end if;
  if coalesce(trim(p ->> 'venue'), '') = '' or coalesce(trim(p ->> 'address'), '') = '' then raise exception 'Lieu et adresse requis.' using errcode = '22023'; end if;
  if coalesce((p ->> 'table_capacity')::int, 0) not between 1 and 100 then raise exception 'Places par table : entre 1 et 100.' using errcode = '22023'; end if;
  if coalesce((p ->> 'expected')::int, 0) not between 0 and 10000 then raise exception 'Personnes attendues : entre 0 et 10 000.' using errcode = '22023'; end if;
end $$;

-- Création gratuite par un administrateur : aucun paiement, aucune transaction, aucun revenu.
create or replace function public.admin_create_event(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_mode text := p ->> 'mode'; v_org uuid := nullif(p ->> 'organizer_id', '')::uuid; item text;
begin
  if not private.has_perm('events.create') then return private.deny('event.create', 'event', null, 'events.create'); end if;
  perform private.validate_event_payload(p);
  if v_mode not in ('platform', 'for_organizer') then raise exception 'Mode de création invalide.' using errcode = '22023'; end if;
  if v_mode = 'for_organizer' and not exists (select 1 from public.profiles where id = v_org) then
    raise exception 'Organisateur introuvable.' using errcode = '22023';
  end if;
  insert into public.events (owner_id, organizer_id, organizer_can_manage, origin, billing, created_by, type, host_a, host_b, title, event_date, event_time,
                             venue, address, dress, message, program, expected, table_capacity, phone_prefix, offer)
  values (null, case when v_mode = 'for_organizer' then v_org end, coalesce((p ->> 'organizer_can_manage')::boolean, true),
          case when v_mode = 'for_organizer' then 'admin_for_organizer' else 'admin_platform' end::public.event_origin, 'free_admin', auth.uid(),
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
    jsonb_build_object('mode', v_mode, 'organizer_id', v_org, 'billing', 'free_admin', 'title', p ->> 'title'));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.admin_update_event(p_event uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('events.write') then return private.deny('event.update', 'event', p_event::text, 'events.write'); end if;
  perform private.validate_event_payload(p);
  update public.events set
    type = coalesce(p ->> 'type', type::text)::public.event_type, host_a = coalesce(p ->> 'host_a', host_a), host_b = coalesce(p ->> 'host_b', host_b),
    title = trim(p ->> 'title'), event_date = (p ->> 'event_date')::date, event_time = coalesce((p ->> 'event_time')::time, event_time),
    venue = trim(p ->> 'venue'), address = trim(p ->> 'address'), dress = coalesce(p ->> 'dress', dress), message = coalesce(p ->> 'message', message),
    program = coalesce(p ->> 'program', program), expected = (p ->> 'expected')::int, table_capacity = (p ->> 'table_capacity')::int,
    offer = coalesce(p ->> 'offer', offer::text)::public.menu_offer
  where id = p_event and status <> 'deleted';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.audit('event.update', 'event', p_event::text, 'success', jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_event_status(p_event uuid, p_status public.event_status, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('events.suspend') then return private.deny('event.status', 'event', p_event::text, 'events.suspend'); end if;
  if p_status not in ('active', 'suspended') then raise exception 'Statut invalide.' using errcode = '22023'; end if;
  if p_status = 'suspended' and char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'Indiquez le motif de la suspension.' using errcode = '22023'; end if;
  update public.events set status = p_status, status_reason = nullif(trim(p_reason), '') where id = p_event and status <> 'deleted';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.audit(case when p_status = 'suspended' then 'event.suspend' else 'event.reactivate' end, 'event', p_event::text, 'success', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- Suppression : les données opérationnelles disparaissent, la trace de l'événement,
-- les transactions et les preuves de paiement sont conservées.
create or replace function private.purge_event(p_event uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.entries where event_id = p_event;
  delete from public.services where event_id = p_event;
  delete from public.guest_orders where event_id = p_event;
  delete from public.guests where event_id = p_event;
  delete from public.catalog_items where event_id = p_event;
  delete from public.staff_accounts where event_id = p_event;
  delete from public.event_log where event_id = p_event;
  update public.events set status = 'deleted', deleted_at = now(), address = '-', message = '', program = '', dress = '', host_a = '', host_b = ''
   where id = p_event;
end $$;

create or replace function public.admin_delete_event(p_event uuid, p_confirm_title text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  if not private.has_perm('events.delete') then return private.deny('event.delete', 'event', p_event::text, 'events.delete'); end if;
  select * into e from public.events where id = p_event and status <> 'deleted';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if trim(coalesce(p_confirm_title, '')) <> e.title then
    return jsonb_build_object('ok', false, 'error', 'confirmation', 'message', 'Recopiez exactement le titre de l''événement pour confirmer.');
  end if;
  perform private.purge_event(p_event);
  perform private.audit('event.delete', 'event', p_event::text, 'success', jsonb_build_object('title', e.title, 'transactions_kept', (select count(*) from public.transactions where event_id = p_event)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_event_detail(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.events; res jsonb;
begin
  if not private.has_perm('events.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'event', to_jsonb(e) - 'service_key',
    'owner', (select jsonb_build_object('id', id, 'username', username, 'email', email, 'phone', phone, 'status', status) from public.profiles where id = e.owner_id),
    'organizer', (select jsonb_build_object('id', id, 'username', username, 'email', email, 'phone', phone, 'status', status) from public.profiles where id = e.organizer_id),
    'stats', public.event_stats(p_event),
    'paid_cents', case when private.has_perm('finance.read') then (select coalesce(sum(amount_cents), 0) from public.transactions where event_id = p_event and status = 'succeeded') end,
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('role', role, 'name', name, 'revoked', revoked)), '[]') from public.staff_accounts where event_id = p_event));
end $$;

-- ---------- organisateurs ----------
create or replace function public.admin_list_organizers(p_search text default '', p_status text default null, p_page int default 1, p_size int default 20)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := '%' || lower(coalesce(p_search, '')) || '%'; res jsonb; tot int; fin boolean := private.has_perm('finance.read');
begin
  if not private.has_perm('organizers.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 100); p_page := greatest(p_page, 1);
  select count(*) into tot from public.profiles p where (p_status is null or p.status::text = p_status)
     and (lower(p.username) like q or lower(coalesce(p.email, '')) like q or coalesce(p.phone, '') like q);
  select coalesce(jsonb_agg(x), '[]') into res from (
    select p.id, p.username, p.full_name, p.email, p.phone, p.status, p.created_at,
           (select count(*) from public.events e where (e.owner_id = p.id or e.organizer_id = p.id) and e.status <> 'deleted') as events,
           case when fin then (select coalesce(sum(amount_cents), 0) from public.transactions t where t.organizer_id = p.id and t.status = 'succeeded') end as paid_cents
      from public.profiles p
     where (p_status is null or p.status::text = p_status)
       and (lower(p.username) like q or lower(coalesce(p.email, '')) like q or coalesce(p.phone, '') like q)
     order by p.created_at desc offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', tot, 'items', res);
end $$;

create or replace function public.admin_organizer_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('organizers.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true,
    'profile', (select to_jsonb(p) - 'tutorials' from public.profiles p where id = p_user),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'date', event_date, 'status', status, 'origin', origin, 'billing', billing) order by created_at desc), '[]')
                 from public.events where (owner_id = p_user or organizer_id = p_user) and status <> 'deleted'),
    'payments', case when private.has_perm('finance.read') then (select coalesce(jsonb_agg(jsonb_build_object('reference', reference, 'amount_cents', amount_cents, 'currency', currency, 'status', status, 'method', method, 'created_at', created_at, 'confirmed_at', confirmed_at) order by created_at desc), '[]')
                 from public.transactions where organizer_id = p_user) end);
end $$;

create or replace function public.admin_set_organizer_status(p_user uuid, p_status public.account_status, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('organizers.suspend') then return private.deny('organizer.status', 'profile', p_user::text, 'organizers.suspend'); end if;
  if p_status = 'suspended' and char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'Indiquez le motif de la suspension.' using errcode = '22023'; end if;
  update public.profiles set status = p_status, status_reason = nullif(trim(p_reason), ''), status_changed_at = now() where id = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.audit(case when p_status = 'suspended' then 'organizer.suspend' else 'organizer.reactivate' end, 'profile', p_user::text, 'success', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- finances et rapports ----------
create or replace function public.admin_transactions(p_status text default null, p_month date default null, p_search text default '', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := '%' || lower(coalesce(p_search, '')) || '%'; m date := date_trunc('month', coalesce(p_month, now()))::date; res jsonb; tot int;
begin
  if not private.has_perm('finance.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 100); p_page := greatest(p_page, 1);
  select count(*) into tot from public.transactions t
   where (p_status is null or t.status::text = p_status) and t.created_at >= m and t.created_at < m + interval '1 month'
     and (lower(t.reference) like q or lower(coalesce(t.event_snapshot ->> 'title', '')) like q);
  select coalesce(jsonb_agg(x), '[]') into res from (
    select t.reference, t.created_at, t.confirmed_at, t.amount_cents, t.currency, t.status, t.method, t.provider, t.persons,
           t.event_snapshot ->> 'title' as event, t.event_id is null as event_deleted, p.username as organizer
      from public.transactions t left join public.profiles p on p.id = t.organizer_id
     where (p_status is null or t.status::text = p_status) and t.created_at >= m and t.created_at < m + interval '1 month'
       and (lower(t.reference) like q or lower(coalesce(t.event_snapshot ->> 'title', '')) like q)
     order by t.created_at desc offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', tot, 'month', m, 'items', res,
    'summary', (select jsonb_build_object(
       'revenue_cents', coalesce(sum(amount_cents) filter (where status = 'succeeded' and confirmed_at >= m and confirmed_at < m + interval '1 month'), 0),
       'succeeded', count(*) filter (where status = 'succeeded'), 'pending', count(*) filter (where status = 'pending'),
       'failed', count(*) filter (where status = 'failed'), 'refunded', count(*) filter (where status = 'refunded'),
       'refunded_cents', coalesce(sum(amount_cents) filter (where status = 'refunded'), 0))
     from public.transactions where created_at >= m and created_at < m + interval '1 month'));
end $$;

-- rapport d'un mois : figé si le mois est clos, calculé en direct sinon
create or replace function private.month_figures(m date) returns public.monthly_reports
language sql stable security definer set search_path = public, pg_temp as $$
  select m,
    coalesce((select sum(amount_cents) from public.transactions where status = 'succeeded' and confirmed_at >= m and confirmed_at < m + interval '1 month'), 0),
    coalesce((select value ->> 'currency' from public.settings where key = 'pricing'), 'USD'),
    (select count(*) from public.transactions where status = 'succeeded' and confirmed_at >= m and confirmed_at < m + interval '1 month')::int,
    (select count(*) from public.transactions where status = 'pending' and created_at >= m and created_at < m + interval '1 month')::int,
    (select count(*) from public.transactions where status = 'failed' and created_at >= m and created_at < m + interval '1 month')::int,
    (select count(*) from public.transactions where status = 'refunded' and refunded_at >= m and refunded_at < m + interval '1 month')::int,
    coalesce((select sum(amount_cents) from public.transactions where status = 'refunded' and refunded_at >= m and refunded_at < m + interval '1 month'), 0),
    (select count(*) from public.events where created_at >= m and created_at < m + interval '1 month')::int,
    (select count(*) from public.events where billing = 'free_admin' and created_at >= m and created_at < m + interval '1 month')::int,
    (select count(*) from public.profiles where created_at >= m and created_at < m + interval '1 month')::int,
    now()
$$;

create or replace function public.admin_reports(p_months int default 12)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cur date := date_trunc('month', now())::date; fin boolean := private.has_perm('finance.read'); res jsonb;
begin
  if not private.has_perm('reports.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select coalesce(jsonb_agg(r order by (r ->> 'month') desc), '[]') into res from (
    select case when fin then to_jsonb(x) else to_jsonb(x) - 'revenue_cents' - 'refunded_cents' - 'tx_succeeded' - 'tx_pending' - 'tx_failed' - 'tx_refunded' end
           || jsonb_build_object('closed', x.month < cur and exists (select 1 from public.monthly_reports mr where mr.month = x.month)) as r
    from (
      select * from public.monthly_reports where month >= cur - make_interval(months => least(greatest(p_months, 1), 60))
      union all
      select (private.month_figures(cur)).*
    ) x) y;
  return jsonb_build_object('ok', true, 'months', res, 'finance', fin);
end $$;

-- Clôture mensuelle (tâche planifiée) : fige le mois écoulé ; rien n'est supprimé.
create or replace function public.close_month(p_month date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m date := date_trunc('month', coalesce(p_month, now() - interval '1 month'))::date;
begin
  if m >= date_trunc('month', now())::date then raise exception 'Seul un mois écoulé peut être clos.' using errcode = '22023'; end if;
  insert into public.monthly_reports select (private.month_figures(m)).* on conflict (month) do nothing;
  perform private.audit('report.close_month', 'month', m::text, 'success');
  return jsonb_build_object('ok', true, 'month', m);
end $$;

-- ---------- paiements (appelé uniquement par le serveur, après vérification de la signature du prestataire) ----------
create or replace function public.apply_payment_event(p_provider text, p_provider_event_id text, p_reference text, p_status public.tx_status, p_provider_ref text, p_amount_cents int, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare tx public.transactions;
begin
  select * into tx from public.transactions where reference = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_reference'); end if;
  if tx.provider <> p_provider then return jsonb_build_object('ok', false, 'error', 'provider_mismatch'); end if;
  insert into public.payment_events (transaction_id, provider, provider_event_id, status, payload)
  values (tx.id, p_provider, p_provider_event_id, p_status, p_payload)
  on conflict (provider, provider_event_id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if p_status = 'succeeded' and p_amount_cents is distinct from tx.amount_cents then
    perform private.audit('payment.amount_mismatch', 'transaction', tx.reference, 'error', jsonb_build_object('expected', tx.amount_cents, 'received', p_amount_cents));
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;
  -- transitions autorisées : pending -> succeeded|failed ; succeeded -> refunded
  if (tx.status = 'pending' and p_status in ('succeeded', 'failed')) or (tx.status = 'succeeded' and p_status = 'refunded') then
    update public.transactions set status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref),
      confirmed_at = case when p_status = 'succeeded' then now() else confirmed_at end,
      failed_at = case when p_status = 'failed' then now() else failed_at end,
      refunded_at = case when p_status = 'refunded' then now() else refunded_at end
    where id = tx.id;
    perform private.audit('payment.' || p_status, 'transaction', tx.reference, 'success', jsonb_build_object('amount_cents', tx.amount_cents, 'provider', p_provider));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- conservation des données ----------
create or replace function public.purge_expired_events()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cfg jsonb; n int := 0; r record;
begin
  select value into cfg from public.settings where key = 'retention';
  if not coalesce((cfg ->> 'enabled')::boolean, false) then return jsonb_build_object('ok', true, 'purged', 0, 'disabled', true); end if;
  for r in select id, title from public.events where status <> 'deleted'
           and (case when cfg ->> 'from' = 'event_date' then event_date::timestamptz else created_at end) + make_interval(days => (cfg ->> 'days')::int) < now()
  loop
    perform private.purge_event(r.id);
    perform private.audit('event.retention_purge', 'event', r.id::text, 'success', jsonb_build_object('title', r.title, 'rule', cfg));
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'purged', n);
end $$;

-- ---------- administrateurs, paramètres, export ----------
create or replace function public.admin_set_role(p_user uuid, p_role public.admin_role, p_active boolean, p_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('admins.manage') then return private.deny('admin.role', 'admin', p_user::text, 'admins.manage'); end if;
  if p_user = auth.uid() and (p_role <> 'super' or not p_active) and (select count(*) from public.admin_users where role = 'super' and active and user_id <> p_user) = 0 then
    return jsonb_build_object('ok', false, 'error', 'last_super', 'message', 'Il doit rester au moins un administrateur principal actif.');
  end if;
  insert into public.admin_users (user_id, role, display_name, active, created_by) values (p_user, p_role, p_name, p_active, auth.uid())
  on conflict (user_id) do update set role = excluded.role, active = excluded.active, display_name = excluded.display_name;
  perform private.audit('admin.role', 'admin', p_user::text, 'success', jsonb_build_object('role', p_role, 'active', p_active));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('settings.write') then return private.deny('settings.update', 'setting', p_key, 'settings.write'); end if;
  if p_key = 'retention' and (jsonb_typeof(p_value -> 'enabled') <> 'boolean' or coalesce((p_value ->> 'days')::int, 0) not between 1 and 3650 or p_value ->> 'from' not in ('creation', 'event_date')) then
    raise exception 'Règle de conservation invalide.' using errcode = '22023';
  end if;
  update public.settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.audit('settings.update', 'setting', p_key, 'success', jsonb_build_object('value', p_value));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_audit(p_action text default null, p_result text default null, p_page int default 1, p_size int default 50)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare res jsonb; tot int;
begin
  if not private.has_perm('audit.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 200); p_page := greatest(p_page, 1);
  select count(*) into tot from public.audit_log where (p_action is null or action like p_action || '%') and (p_result is null or result = p_result);
  select coalesce(jsonb_agg(x), '[]') into res from (
    select id, at, actor_label, actor_role, action, object_type, object_id, result, details from public.audit_log
     where (p_action is null or action like p_action || '%') and (p_result is null or result = p_result)
     order by at desc offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', tot, 'items', res);
end $$;

-- Export : journalisé, réservé à reports.export ; le contenu financier exige aussi finance.read.
create or replace function public.admin_export(p_kind text, p_month date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m date := date_trunc('month', coalesce(p_month, now()))::date; rows jsonb;
begin
  if not private.has_perm('reports.export') then return private.deny('report.export', 'export', p_kind, 'reports.export'); end if;
  if p_kind = 'transactions' then
    if not private.has_perm('finance.read') then return private.deny('report.export', 'export', p_kind, 'finance.read'); end if;
    select coalesce(jsonb_agg(x order by x.created_at), '[]') into rows from (
      select reference, created_at, confirmed_at, amount_cents, currency, status, method, provider, event_snapshot ->> 'title' as event
      from public.transactions where created_at >= m and created_at < m + interval '1 month') x;
  elsif p_kind = 'monthly' then
    select public.admin_reports(24) -> 'months' into rows;
  else
    raise exception 'Export inconnu.' using errcode = '22023';
  end if;
  perform private.audit('report.export', 'export', p_kind, 'success', jsonb_build_object('month', m, 'rows', jsonb_array_length(rows)));
  return jsonb_build_object('ok', true, 'rows', rows);
end $$;

-- connexion admin : limitation des tentatives (appelée par le serveur de l'espace admin)
create or replace function public.admin_login_guard(p_email text, p_ip text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare h text := encode(digest(lower(trim(coalesce(p_email, ''))), 'sha256'), 'hex'); n_email int; n_ip int;
begin
  select count(*) into n_email from public.admin_login_attempts where email_hash = h and not success and at > now() - interval '15 minutes';
  select count(*) into n_ip from public.admin_login_attempts where ip = coalesce(p_ip, '') and not success and at > now() - interval '15 minutes';
  return jsonb_build_object('allowed', n_email < 5 and n_ip < 20, 'retry_after_minutes', 15);
end $$;

create or replace function public.admin_login_record(p_email text, p_ip text, p_success boolean)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  insert into public.admin_login_attempts (email_hash, ip, success)
  values (encode(digest(lower(trim(coalesce(p_email, ''))), 'sha256'), 'hex'), coalesce(p_ip, ''), p_success)
$$;

-- ---------- droits d'exécution ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.admin_dashboard(), public.admin_list_events(text, text, text, int, int), public.admin_create_event(jsonb),
  public.admin_update_event(uuid, jsonb), public.admin_set_event_status(uuid, public.event_status, text), public.admin_delete_event(uuid, text),
  public.admin_event_detail(uuid), public.admin_list_organizers(text, text, int, int), public.admin_organizer_detail(uuid),
  public.admin_set_organizer_status(uuid, public.account_status, text), public.admin_transactions(text, date, text, int, int),
  public.admin_reports(int), public.admin_set_role(uuid, public.admin_role, boolean, text), public.admin_update_setting(text, jsonb),
  public.admin_audit(text, text, int, int), public.admin_export(text, date) to authenticated;
-- fonctions système : clé serveur uniquement (jamais exposée au navigateur)
grant execute on function public.apply_payment_event(text, text, text, public.tx_status, text, int, jsonb), public.close_month(date),
  public.purge_expired_events(), public.admin_login_guard(text, text), public.admin_login_record(text, text, boolean) to service_role;
-- rétablit les droits définis dans la migration précédente
grant execute on function public.save_table_plan(uuid, jsonb, boolean, text), public.create_staff(uuid, public.staff_role, text, text),
  public.set_staff_revoked(uuid, boolean), public.reset_staff_password(uuid, text), public.delete_staff(uuid),
  public.event_stats(uuid), public.service_totals(uuid), public.create_checkout(uuid, public.tx_method, text) to authenticated;
grant execute on function public.get_invitation(text), public.submit_rsvp(text, public.rsvp_answer, uuid[], uuid[]),
  public.staff_login(text, uuid, text, text), public.staff_lookup(text, text), public.staff_confirm_entry(text, uuid),
  public.staff_mark_served(text, uuid, public.service_kind), public.staff_logout(text) to anon, authenticated;

-- ---------- tâches planifiées (pg_cron, si disponible) ----------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ceremonia-close-month', '5 0 1 * *', 'select public.close_month()');
    perform cron.schedule('ceremonia-retention', '17 3 * * *', 'select public.purge_expired_events()');
    perform cron.schedule('ceremonia-staff-sessions', '*/30 * * * *', 'delete from public.staff_sessions where expires_at < now()');
  end if;
end $$;
