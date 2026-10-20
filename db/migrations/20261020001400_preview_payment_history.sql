-- =====================================================================
-- Skyevenapp : aperçu de l'invitation, paiement simulé, création après paiement,
-- historique statistique des événements supprimés, fonctions d'administration.
--
-- Parcours organisateur : étapes de création (inchangées) → brouillon enregistré (status 'draft')
-- → photos → aperçu → « Générer mon invitation » → paiement simulé → l'événement devient actif.
-- Un brouillon n'est jamais actif : invitations fermées (invitations_open exige 'active'), aucun accès
-- du jour J, absent des listes d'événements actifs. Toutes les vérifications sont faites ici, côté serveur.
-- =====================================================================

-- ---------- moyens de paiement : le prestataire « simulation » rejoint Stripe et CinetPay ----------
alter table public.transactions drop constraint if exists transactions_provider_check;
alter table public.transactions add constraint transactions_provider_check check (provider in ('stripe', 'cinetpay', 'simulation'));

-- Paiement simulé actif pour cette version (aucune passerelle réelle n'est appelée). Désactivable par la base.
insert into public.settings (key, value) values ('payment_simulation', '{"enabled": true}') on conflict (key) do nothing;

create or replace function private.simulation_enabled() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value ->> 'enabled')::boolean from public.settings where key = 'payment_simulation'), false)
$$;

-- ---------- date d'activation (création définitive) ----------
alter table public.events add column if not exists activated_at timestamptz;
update public.events set activated_at = created_at where activated_at is null and status <> 'draft';

-- Un événement créé par un organisateur commence toujours en brouillon, quoi que le client envoie :
-- il ne devient actif qu'après un paiement confirmé (déclencheur transactions_activate_draft ci-dessous).
-- Les événements créés par l'administration (fonctions SECURITY DEFINER) restent actifs dès la création.
create or replace function private.organizer_event_draft() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origin = 'organizer' and current_user = 'authenticated' then
    new.status := 'draft';
    new.activated_at := null;
  elsif new.status <> 'draft' and new.activated_at is null then
    new.activated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists events_organizer_draft on public.events;
create trigger events_organizer_draft before insert on public.events
  for each row execute function private.organizer_event_draft();

-- Nombre d'invités obligatoire pour un événement d'organisateur : il sert à calculer le prix.
-- Vérifié à chaque nouvelle valeur envoyée par un organisateur (les valeurs déjà enregistrées ne sont pas bloquées).
create or replace function private.require_guest_count() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origin = 'organizer' and current_user = 'authenticated' and new.expected < 1
     and (tg_op = 'INSERT' or new.expected is distinct from old.expected) then
    raise exception 'Indiquez le nombre d''invités (un nombre entier, au moins 1) : il sert à calculer le prix.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists events_require_guest_count on public.events;
create trigger events_require_guest_count before insert or update of expected on public.events
  for each row execute function private.require_guest_count();

-- Accès organisateur : un brouillon est modifiable par son propriétaire (retour aux étapes, photos),
-- comme un événement actif. Le reste est inchangé.
create or replace function private.org_access(p_event uuid, p_write boolean) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.events e
    join public.profiles pr on pr.id = auth.uid()
    where e.id = p_event
      and e.status <> 'deleted'
      and (e.owner_id = auth.uid() or (e.organizer_id = auth.uid() and e.organizer_can_manage))
      and (not p_write or (e.status in ('active', 'draft') and pr.status = 'active'))
  )
$$;

-- Les accès du jour J (contrôleurs, serveurs) ne s'ouvrent qu'après la création définitive.
create or replace function private.no_staff_on_draft() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.events where id = new.event_id and status = 'draft') then
    raise exception 'Accès refusé : finalisez d''abord le paiement, les accès du jour J s''ouvrent après la création de l''événement.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists staff_no_draft on public.staff_accounts;
create trigger staff_no_draft before insert on public.staff_accounts
  for each row execute function private.no_staff_on_draft();

-- ---------- tarif : même calcul que create_checkout et event_billing (tarification existante, inchangée) ----------
create or replace function private.event_price(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with e as (select * from public.events where id = p_event),
       pr as (select value as v from public.settings where key = 'pricing'),
       p as (select greatest(e.expected, coalesce((select sum(g.seats) from public.guests g where g.event_id = e.id), 0))::int as persons from e)
  select jsonb_build_object(
    'persons', p.persons,
    'units', ceil(greatest(p.persons, 1)::numeric / (pr.v ->> 'unit_persons')::int)::int,
    'unit_cents', (pr.v ->> 'unit_cents')::int,
    'unit_persons', (pr.v ->> 'unit_persons')::int,
    'currency', pr.v ->> 'currency',
    'amount_cents', ceil(greatest(p.persons, 1)::numeric / (pr.v ->> 'unit_persons')::int)::int * (pr.v ->> 'unit_cents')::int)
  from p, pr
$$;

-- ---------- activation : tout paiement confirmé d'un brouillon le rend actif (une seule fois) ----------
create or replace function private.activate_paid_draft() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'succeeded' and old.status is distinct from 'succeeded' and new.event_id is not null then
    update public.events set status = 'active', activated_at = now() where id = new.event_id and status = 'draft';
    if found then
      perform private.event_log(new.event_id, 'Skyevenapp', 'Paiement confirmé : événement créé, invitation et lien de partage activés');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists transactions_activate_draft on public.transactions;
create trigger transactions_activate_draft after update of status on public.transactions
  for each row execute function private.activate_paid_draft();

-- Paiement par prestataire (Stripe, CinetPay) : accepté aussi pour un brouillon, que le webhook signé active
-- ensuite (transactions_activate_draft). Calcul du montant identique à la version précédente.
create or replace function public.create_checkout(p_event uuid, p_method public.tx_method, p_provider text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; persons int; units int; amount int; paid int; tx public.transactions;
begin
  select * into e from public.events where id = p_event;
  if not found or e.owner_id is distinct from auth.uid() or e.billing <> 'paid' or e.status not in ('active', 'draft') then
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

-- ---------- paiement simulé : démarrage (montant calculé ici, jamais par le navigateur) ----------
create or replace function public.start_simulated_checkout(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; tx public.transactions;
begin
  if not private.simulation_enabled() then
    raise exception 'Paiement refusé : le paiement simulé n''est pas disponible.' using errcode = '42501';
  end if;
  select * into e from public.events where id = p_event for update;
  if not found or e.owner_id is distinct from auth.uid() or e.origin <> 'organizer' then
    raise exception 'Paiement refusé : seul l''organisateur qui crée cet événement peut le régler.' using errcode = '42501';
  end if;
  if e.status = 'active' then
    return jsonb_build_object('ok', true, 'already_active', true, 'event_id', e.id);
  end if;
  if e.status <> 'draft' or not private.org_access(e.id, true) then
    raise exception 'Paiement refusé : cet événement n''est pas disponible.' using errcode = '42501';
  end if;
  if e.expected < 1 then
    raise exception 'Indiquez le nombre d''invités (au moins 1) avant le paiement : il sert à calculer le prix.' using errcode = '23514';
  end if;
  if coalesce(array_length(e.photos, 1), 0) = 0 then
    raise exception 'Ajoutez au moins une photo pour l''invitation avant le paiement.' using errcode = '23514';
  end if;
  pr := private.event_price(e.id);
  -- un paiement en attente au même montant est repris (double clic, actualisation, retour arrière)
  select * into tx from public.transactions
   where event_id = e.id and provider = 'simulation' and status = 'pending'
   order by created_at desc limit 1 for update;
  if found and tx.amount_cents = (pr ->> 'amount_cents')::int and tx.persons = (pr ->> 'persons')::int then
    return jsonb_build_object('ok', true, 'reference', tx.reference, 'event_id', e.id, 'amount_cents', tx.amount_cents, 'currency', tx.currency, 'resumed', true);
  end if;
  if found then -- le nombre d'invités a changé : l'ancien récapitulatif n'est plus valable
    update public.transactions set status = 'cancelled', failed_at = now() where id = tx.id;
  end if;
  insert into public.transactions (event_id, organizer_id, event_snapshot, persons, amount_cents, currency, method, provider)
  values (e.id, e.owner_id,
          jsonb_build_object('title', e.title, 'date', e.event_date, 'short_id', e.short_id, 'simulated', true,
                             'expected', e.expected, 'units', pr -> 'units', 'unit_cents', pr -> 'unit_cents', 'unit_persons', pr -> 'unit_persons'),
          (pr ->> 'persons')::int, (pr ->> 'amount_cents')::int, pr ->> 'currency', 'simulation', 'simulation')
  returning * into tx;
  perform private.event_log(e.id, private.actor_label(), 'Paiement simulé en attente : ' || tx.reference);
  return jsonb_build_object('ok', true, 'reference', tx.reference, 'event_id', e.id, 'amount_cents', tx.amount_cents, 'currency', tx.currency, 'resumed', false);
end $$;

-- ---------- paiement simulé : issue choisie par l'organisateur (réussi, échoué, annulé) ----------
-- Idempotent : un paiement déjà réussi n'est jamais rejoué ; la ligne est verrouillée (clics simultanés).
-- Le montant est recalculé : si le nombre d'invités a changé depuis le récapitulatif, le paiement est annulé.
create or replace function public.complete_simulated_payment(p_reference text, p_outcome text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare tx public.transactions; e public.events; pr jsonb; st public.tx_status;
begin
  if not private.simulation_enabled() then
    raise exception 'Paiement refusé : le paiement simulé n''est pas disponible.' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'Issue de paiement invalide.' using errcode = '22023';
  end if;
  select * into tx from public.transactions where reference = p_reference for update;
  if not found or tx.provider <> 'simulation' or tx.organizer_id is distinct from auth.uid() then
    raise exception 'Paiement introuvable.' using errcode = 'P0002';
  end if;
  if tx.status = 'succeeded' then
    return jsonb_build_object('ok', true, 'status', 'succeeded', 'event_id', tx.event_id, 'already', true);
  end if;
  if tx.status <> 'pending' then
    return jsonb_build_object('ok', false, 'status', tx.status, 'event_id', tx.event_id,
      'error', 'Ce paiement est déjà clôturé. Relancez le paiement depuis l’aperçu.');
  end if;
  select * into e from public.events where id = tx.event_id for update;
  if not found or e.status not in ('draft', 'active') then
    update public.transactions set status = 'cancelled', failed_at = now() where id = tx.id;
    return jsonb_build_object('ok', false, 'status', 'cancelled', 'error', 'Cet événement n’est plus disponible.');
  end if;
  if p_outcome = 'succeeded' then
    if not private.org_access(e.id, true) then
      raise exception 'Paiement refusé : compte ou événement suspendu.' using errcode = '42501';
    end if;
    pr := private.event_price(e.id);
    if (pr ->> 'amount_cents')::int <> tx.amount_cents then
      update public.transactions set status = 'cancelled', failed_at = now() where id = tx.id;
      return jsonb_build_object('ok', false, 'status', 'cancelled', 'event_id', e.id,
        'error', 'Le nombre d’invités a changé depuis le récapitulatif : le montant a été recalculé. Relancez le paiement.');
    end if;
  end if;
  st := p_outcome::public.tx_status;
  insert into public.payment_events (transaction_id, provider, provider_event_id, status, payload)
  values (tx.id, 'simulation', 'sim-' || tx.reference, st, jsonb_build_object('simulated', true, 'outcome', p_outcome));
  -- la confirmation déclenche l'activation du brouillon (transactions_activate_draft)
  update public.transactions set status = st, provider_ref = 'SIM-' || tx.reference,
         confirmed_at = case when st = 'succeeded' then now() else confirmed_at end,
         failed_at = case when st = 'succeeded' then failed_at else now() end
   where id = tx.id;
  perform private.event_log(e.id, private.actor_label(), case p_outcome
    when 'succeeded' then 'Paiement simulé réussi : ' when 'failed' then 'Paiement simulé échoué : ' else 'Paiement annulé : ' end || tx.reference);
  perform private.audit('payment.simulated_' || p_outcome, 'transaction', tx.reference, 'success',
    jsonb_build_object('amount_cents', tx.amount_cents, 'currency', tx.currency, 'event', e.id, 'simulated', true));
  return jsonb_build_object('ok', true, 'status', p_outcome, 'event_id', e.id);
end $$;

-- ---------- historique statistique des événements supprimés ----------
-- Uniquement : nom de l'événement, nombre d'invités, montant généré (plus l'identifiant d'origine, qui empêche
-- toute double comptabilisation, la devise et la date). Aucun nom d'invité, coordonnée, photo ou invitation.
create table if not exists public.event_history (
  event_id uuid primary key,
  title text not null,
  guests int not null check (guests >= 0),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  deleted_at timestamptz not null default now()
);
create index if not exists event_history_deleted_idx on public.event_history (deleted_at desc);
alter table public.event_history enable row level security;
revoke all on public.event_history from anon, authenticated;
-- lecture : uniquement par admin_event_history (permission vérifiée, montants masqués sans finance.read)

-- Suppression (administration, organisateur, règle de conservation) : l'historique est écrit avant l'effacement.
-- Un brouillon (jamais payé ni actif) est effacé entièrement, sans statistique.
create or replace function private.purge_event(p_event uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or e.status = 'deleted' then return; end if;
  if e.status = 'draft' then
    delete from public.events where id = p_event; -- invités, listes, photos : suppression en cascade ; transactions conservées
    return;
  end if;
  insert into public.event_history (event_id, title, guests, amount_cents, currency)
  values (e.id, e.title,
    greatest(e.expected, coalesce((select sum(seats) from public.guests where event_id = e.id), 0)),
    coalesce((select sum(amount_cents) from public.transactions where event_id = e.id and status = 'succeeded'), 0),
    coalesce((select max(currency) from public.transactions where event_id = e.id and status = 'succeeded'),
             (select value ->> 'currency' from public.settings where key = 'pricing'), 'USD'))
  on conflict (event_id) do nothing;
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

-- Brouillons abandonnés (aucune activité depuis 30 jours) : effacés par la tâche planifiée.
create or replace function public.purge_stale_drafts(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; r record;
begin
  for r in select id, title from public.events where status = 'draft' and updated_at < now() - make_interval(days => greatest(p_days, 1)) loop
    update public.transactions set status = 'cancelled', failed_at = now() where event_id = r.id and status = 'pending';
    perform private.purge_event(r.id);
    perform private.audit('event.draft_purge', 'event', r.id::text, 'success', jsonb_build_object('title', r.title));
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'purged', n);
end $$;

-- ---------- administration ----------
create or replace function public.admin_event_history(p_search text default '', p_sort text default 'recent', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := '%' || lower(coalesce(p_search, '')) || '%'; fin boolean := private.has_perm('finance.read'); res jsonb; tot jsonb;
begin
  if not private.has_perm('reports.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 100); p_page := greatest(p_page, 1);
  select jsonb_build_object('count', count(*), 'guests', coalesce(sum(guests), 0),
         'amount_cents', case when fin then coalesce(sum(amount_cents), 0) end,
         'currency', coalesce(max(currency), (select value ->> 'currency' from public.settings where key = 'pricing')))
    into tot from public.event_history where lower(title) like q;
  select coalesce(jsonb_agg(x), '[]') into res from (
    select title, guests, case when fin then amount_cents end as amount_cents, currency, deleted_at
      from public.event_history where lower(title) like q
     order by case when p_sort = 'title' then lower(title) end asc,
              case when p_sort = 'guests' then guests end desc,
              case when p_sort = 'amount' and fin then amount_cents end desc,
              case when p_sort = 'oldest' then deleted_at end asc,
              deleted_at desc
     offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', (tot ->> 'count')::int, 'totals', tot, 'items', res, 'finance', fin);
end $$;

-- Tableau de bord : les brouillons (non payés) ne comptent jamais comme événements ; séries sur 12 mois pour les graphiques.
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m date := date_trunc('month', now())::date; fin boolean := private.has_perm('finance.read'); res jsonb;
begin
  if not private.has_perm('dashboard.read') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select jsonb_build_object('ok', true,
    'events', jsonb_build_object(
      'total', (select count(*) from public.events where status not in ('deleted', 'draft')),
      'active', (select count(*) from public.events where status = 'active'),
      'suspended', (select count(*) from public.events where status = 'suspended'),
      'this_month', (select count(*) from public.events where status <> 'draft' and coalesce(activated_at, created_at) >= m),
      'free_admin', (select count(*) from public.events where billing = 'free_admin' and status not in ('deleted', 'draft')),
      'drafts', (select count(*) from public.events where status = 'draft'),
      'deleted_kept', (select count(*) from public.event_history)),
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
    'series', (select coalesce(jsonb_agg(jsonb_build_object('month', s.mo, 'events', s.ev, 'organizers', s.org, 'revenue_cents', case when fin then s.rev end) order by s.mo), '[]')
      from (select mo::date as mo,
                   (select count(*) from public.events where status <> 'draft' and activated_at >= mo and activated_at < mo + interval '1 month') as ev,
                   (select count(*) from public.profiles where created_at >= mo and created_at < mo + interval '1 month') as org,
                   (select coalesce(sum(amount_cents), 0) from public.transactions where status = 'succeeded' and confirmed_at >= mo and confirmed_at < mo + interval '1 month') as rev
              from generate_series(m - interval '11 months', m, interval '1 month') as mo) s),
    'activity', case when private.has_perm('audit.read') then (select coalesce(jsonb_agg(x), '[]') from (select at, actor_label, action, object_type, object_id, result from public.audit_log order by at desc limit 8) x) else null end,
    'alerts', case when private.has_perm('security.read') then jsonb_build_object(
      'failed_admin_logins_24h', (select count(*) from public.admin_login_attempts where not success and at > now() - interval '24 hours'),
      'denied_actions_24h', (select count(*) from public.audit_log where result = 'denied' and at > now() - interval '24 hours'),
      'locked_staff', (select count(*) from public.staff_accounts where locked_until > now()),
      'recent', (select coalesce(jsonb_agg(x), '[]') from (select at, actor_label, action, object_type, details from public.audit_log where result = 'denied' order by at desc limit 5) x)) else null end
  ) into res;
  return res;
end $$;

-- Notifications de la barre supérieure : uniquement ce que le rôle peut voir.
create or replace function public.admin_notifications()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare items jsonb := '[]'::jsonb; n int;
begin
  if not private.has_perm('dashboard.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if private.has_perm('finance.read') then
    select count(*) into n from public.transactions where status = 'pending';
    if n > 0 then items := items || jsonb_build_object('kind', 'payment', 'count', n, 'label', n || ' paiement(s) en attente', 'href', '/finance?status=pending'); end if;
  end if;
  if private.has_perm('security.read') then
    select count(*) into n from public.audit_log where result = 'denied' and at > now() - interval '24 hours';
    if n > 0 then items := items || jsonb_build_object('kind', 'security', 'count', n, 'label', n || ' action(s) refusée(s) en 24 h', 'href', '/audit?r=denied'); end if;
    select count(*) into n from public.admin_login_attempts where not success and at > now() - interval '24 hours';
    if n > 0 then items := items || jsonb_build_object('kind', 'security', 'count', n, 'label', n || ' connexion(s) admin échouée(s) en 24 h', 'href', '/audit?a=auth.'); end if;
  end if;
  if private.has_perm('reports.read') then
    select count(*) into n from public.event_history where deleted_at > now() - interval '7 days';
    if n > 0 then items := items || jsonb_build_object('kind', 'history', 'count', n, 'label', n || ' événement(s) supprimé(s) cette semaine', 'href', '/history'); end if;
  end if;
  if private.has_perm('events.read') then
    select count(*) into n from public.events where status = 'draft';
    if n > 0 then items := items || jsonb_build_object('kind', 'draft', 'count', n, 'label', n || ' brouillon(s) en attente de paiement', 'href', '/events?status=draft'); end if;
  end if;
  return jsonb_build_object('ok', true, 'items', items);
end $$;

-- Liste des événements : tri ajouté ; les brouillons (non payés) n'apparaissent qu'avec le filtre « Brouillons ».
drop function if exists public.admin_list_events(text, text, text, int, int);
create or replace function public.admin_list_events(p_search text default '', p_status text default null, p_origin text default null, p_page int default 1, p_size int default 20, p_sort text default 'recent')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := '%' || lower(coalesce(p_search, '')) || '%'; res jsonb; tot int;
begin
  if not private.has_perm('events.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 100); p_page := greatest(p_page, 1);
  select count(*) into tot from public.events e
   where e.status <> 'deleted' and ((p_status is null and e.status <> 'draft') or e.status::text = p_status) and (p_origin is null or e.origin::text = p_origin)
     and (lower(e.title) like q or lower(e.venue) like q or e.short_id like q);
  select coalesce(jsonb_agg(x), '[]') into res from (
    select e.id, e.short_id, e.title, e.type, e.event_date, e.venue, e.status, e.origin, e.billing, e.created_at, e.activated_at, e.expected,
           coalesce(o.username, a.username) as organizer,
           (select count(*) from public.guests g where g.event_id = e.id) as invitations,
           (select coalesce(sum(seats), 0) from public.guests g where g.event_id = e.id) as persons,
           (select coalesce(sum(persons), 0) from public.entries en where en.event_id = e.id) as present
      from public.events e
      left join public.profiles o on o.id = e.owner_id
      left join public.profiles a on a.id = e.organizer_id
     where e.status <> 'deleted' and ((p_status is null and e.status <> 'draft') or e.status::text = p_status) and (p_origin is null or e.origin::text = p_origin)
       and (lower(e.title) like q or lower(e.venue) like q or e.short_id like q)
     order by case when p_sort = 'date_asc' then e.event_date end asc,
              case when p_sort = 'date_desc' then e.event_date end desc,
              case when p_sort = 'title' then lower(e.title) end asc,
              case when p_sort = 'persons' then greatest(e.expected, (select coalesce(sum(seats), 0) from public.guests g where g.event_id = e.id)) end desc,
              e.created_at desc
     offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', tot, 'page', p_page, 'size', p_size, 'items', res);
end $$;

-- ---------- droits d'exécution ----------
revoke execute on function private.simulation_enabled(), private.event_price(uuid) from public, anon, authenticated;
revoke execute on function public.start_simulated_checkout(uuid), public.complete_simulated_payment(text, text),
  public.admin_event_history(text, text, int, int), public.admin_notifications(), public.admin_dashboard(),
  public.admin_list_events(text, text, text, int, int, text), public.purge_stale_drafts(int) from public, anon;
grant execute on function public.start_simulated_checkout(uuid), public.complete_simulated_payment(text, text),
  public.create_checkout(uuid, public.tx_method, text) to authenticated;
grant execute on function public.admin_event_history(text, text, int, int), public.admin_notifications(), public.admin_dashboard(),
  public.admin_list_events(text, text, text, int, int, text) to authenticated;
revoke execute on function public.purge_stale_drafts(int) from authenticated;
grant execute on function public.purge_stale_drafts(int) to service_role;
