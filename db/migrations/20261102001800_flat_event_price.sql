-- =====================================================================
-- Skyevenapp : prix unique par événement (20 USD), paiement en une fois, sans abonnement.
-- Invités et invitations illimités, toutes les fonctionnalités incluses. Remplace, pour les événements
-- créés à partir de cette version, le tarif « par tranche de personnes ».
--
-- Protection des événements existants (cette migration ne modifie ni ne supprime aucune ligne) :
-- - événements, invités, invitations, photos, tables, QR codes, transactions et organisateurs : inchangés ;
-- - les colonnes ajoutées restent vides pour les événements existants : prix vide = événement OFFERT
--   (enregistré avant le prix unique). Aucun montant ne lui est demandé, ni l'ancien tarif ni le nouveau ;
--   ses invitations s'ouvrent sans paiement et un brouillon existant s'active sans paiement à la fin de sa création ;
-- - les paiements déjà enregistrés restent dans l'historique des transactions ;
-- - la règle de conservation (suppression automatique) et la tâche planifiée ne sont pas modifiées.
-- =====================================================================

-- ---------- prix unique (modifiable par l'administration ; s'applique aux événements créés ensuite) ----------
insert into public.settings (key, value) values ('event_price', '{"currency": "USD", "cents": 2000}') on conflict (key) do nothing;

-- Prix figé à la création de l'événement. NULL : événement antérieur à cette version (tarif d'origine conservé).
-- Aucun droit d'écriture n'est accordé au navigateur sur ces colonnes : seul le déclencheur ci-dessous les remplit.
alter table public.events add column if not exists price_cents int check (price_cents is null or price_cents > 0);
alter table public.events add column if not exists price_currency text check (price_currency is null or price_currency ~ '^[A-Z]{3}$');

create or replace function private.event_flat_price() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p jsonb;
begin
  if new.billing = 'paid' then
    select value into p from public.settings where key = 'event_price';
    new.price_cents := coalesce((p ->> 'cents')::int, 2000);
    new.price_currency := coalesce(p ->> 'currency', 'USD');
  else
    new.price_cents := null;
    new.price_currency := null;
  end if;
  return new;
end $$;
drop trigger if exists events_flat_price on public.events;
create trigger events_flat_price before insert on public.events
  for each row execute function private.event_flat_price();

-- ---------- montant dû d'un événement : seule source pour event_billing, create_checkout et le paiement simulé ----------
-- model : 'free' (offert par l'administration), 'offered' (enregistré avant le prix unique : offert), 'flat' (prix unique).
create or replace function private.event_price(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.events; persons int; cur text;
begin
  select * into e from public.events where id = p_event;
  if not found then return null; end if;
  select greatest(e.expected, coalesce(sum(seats), 0)) into persons from public.guests where event_id = e.id;
  if e.price_cents is not null then
    return jsonb_build_object('model', 'flat', 'persons', persons, 'amount_cents', e.price_cents, 'currency', e.price_currency);
  end if;
  cur := coalesce((select value ->> 'currency' from public.settings where key = 'event_price'), 'USD');
  return jsonb_build_object('model', case when e.billing = 'free_admin' then 'free' else 'offered' end, 'persons', persons, 'amount_cents', 0, 'currency', cur);
end $$;

-- Événement offert : par l'administration, ou enregistré avant le prix unique (prix vide sur un événement d'organisateur).
create or replace function private.event_offered(e public.events) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select e.billing = 'free_admin' or e.price_cents is null
$$;

-- ---------- règlement (mêmes clés qu'avant, plus model et flat) ----------
create or replace function public.event_billing(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; due int; paid int; pending int;
begin
  if not private.can_read_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event;
  pr := private.event_price(p_event);
  due := (pr ->> 'amount_cents')::int;
  select coalesce(sum(amount_cents) filter (where status = 'succeeded'), 0), coalesce(sum(amount_cents) filter (where status = 'pending'), 0)
    into paid, pending from public.transactions where event_id = e.id;
  return jsonb_build_object('free', private.event_offered(e), 'model', pr ->> 'model', 'flat', pr ->> 'model' = 'flat',
    'persons', (pr ->> 'persons')::int, 'currency', pr ->> 'currency',
    'due_cents', due, 'paid_cents', paid, 'pending_cents', pending, 'remaining_cents', greatest(0, due - paid),
    'can_send', private.event_offered(e) or paid >= due);
end $$;

-- Liens d'invitation : un événement offert s'ouvre sans paiement ; un événement payant après un paiement confirmé.
create or replace function private.invitations_open(e public.events) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select e.status = 'active' and (private.event_offered(e)
    or exists (select 1 from public.transactions t where t.event_id = e.id and t.status = 'succeeded'))
$$;

-- Brouillon offert (enregistré avant le prix unique) : création finalisée sans paiement, avec les mêmes contrôles.
-- Appelée avec l'événement verrouillé ; renvoie false si l'événement n'est pas un brouillon offert.
create or replace function private.activate_offered_draft(e public.events) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if e.status <> 'draft' or e.billing <> 'paid' or e.price_cents is not null then return false; end if;
  if not private.org_access(e.id, true) then
    raise exception 'Création refusée : compte ou événement suspendu.' using errcode = '42501';
  end if;
  if e.expected < 1 then
    raise exception 'Indiquez le nombre d''invités (au moins 1) avant de générer l''invitation.' using errcode = '23514';
  end if;
  if coalesce(array_length(e.photos, 1), 0) = 0 then
    raise exception 'Ajoutez au moins une photo pour l''invitation avant de la générer.' using errcode = '23514';
  end if;
  update public.events set status = 'active', activated_at = now() where id = e.id and status = 'draft';
  perform private.event_log(e.id, private.actor_label(), 'Événement offert par Skyevenapp : créé sans paiement, invitation et lien de partage activés');
  perform private.audit('event.offered_activate', 'event', e.id::text, 'success', jsonb_build_object('title', e.title));
  return true;
end $$;

-- « Générer mon invitation » d'un brouillon offert, quand le paiement simulé n'est pas proposé (production).
create or replace function public.activate_offered_event(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.owner_id is distinct from auth.uid() or e.origin <> 'organizer' then
    raise exception 'Création refusée : seul l''organisateur qui crée cet événement peut la finaliser.' using errcode = '42501';
  end if;
  if e.status = 'active' then return jsonb_build_object('ok', true, 'already_active', true); end if;
  if not private.activate_offered_draft(e) then
    return jsonb_build_object('ok', false, 'error', 'Cet événement n’est pas offert : réglez-le depuis la page de paiement.');
  end if;
  return jsonb_build_object('ok', true, 'already_active', false);
end $$;

-- ---------- paiement par prestataire : un seul paiement par événement, montant calculé ici ----------
create or replace function public.create_checkout(p_event uuid, p_method public.tx_method, p_provider text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; amount int; paid int; tx public.transactions;
begin
  select * into e from public.events where id = p_event;
  if not found or e.owner_id is distinct from auth.uid() or e.billing <> 'paid' or e.status not in ('active', 'draft') then
    raise exception 'Paiement impossible pour cet événement.' using errcode = '42501';
  end if;
  if p_provider not in ('stripe', 'cinetpay', 'wonyapay') or (p_method = 'card' and p_provider <> 'stripe')
     or (p_method = 'mobile_money' and p_provider not in ('cinetpay', 'wonyapay')) then
    raise exception 'Moyen de paiement invalide.' using errcode = '22023';
  end if;
  pr := private.event_price(e.id);
  select coalesce(sum(amount_cents) filter (where status = 'succeeded'), 0) into paid from public.transactions where event_id = e.id;
  amount := (pr ->> 'amount_cents')::int - paid;
  if amount <= 0 then return jsonb_build_object('ok', false, 'error', 'Rien à régler.'); end if;
  insert into public.transactions (event_id, organizer_id, event_snapshot, persons, amount_cents, currency, method, provider)
  values (e.id, e.owner_id, jsonb_build_object('title', e.title, 'date', e.event_date, 'short_id', e.short_id, 'pricing', pr ->> 'model'),
          (pr ->> 'persons')::int, amount, pr ->> 'currency', p_method, p_provider)
  returning * into tx;
  return jsonb_build_object('ok', true, 'reference', tx.reference, 'amount_cents', tx.amount_cents, 'currency', tx.currency);
end $$;

-- ---------- paiement simulé : prix unique, le nombre d'invités ne change plus le montant ----------
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
    raise exception 'Indiquez le nombre d''invités (au moins 1) avant le paiement.' using errcode = '23514';
  end if;
  if coalesce(array_length(e.photos, 1), 0) = 0 then
    raise exception 'Ajoutez au moins une photo pour l''invitation avant le paiement.' using errcode = '23514';
  end if;
  -- brouillon enregistré avant le prix unique : offert, créé sans paiement
  if private.activate_offered_draft(e) then
    return jsonb_build_object('ok', true, 'already_active', true, 'offered', true, 'event_id', e.id);
  end if;
  pr := private.event_price(e.id);
  -- un paiement en attente au même montant est repris (double clic, actualisation, retour arrière)
  select * into tx from public.transactions
   where event_id = e.id and provider = 'simulation' and status = 'pending'
   order by created_at desc limit 1 for update;
  if found and tx.amount_cents = (pr ->> 'amount_cents')::int then
    return jsonb_build_object('ok', true, 'reference', tx.reference, 'event_id', e.id, 'amount_cents', tx.amount_cents, 'currency', tx.currency, 'resumed', true);
  end if;
  if found then -- le montant a changé : l'ancien récapitulatif n'est plus valable
    update public.transactions set status = 'cancelled', failed_at = now() where id = tx.id;
  end if;
  insert into public.transactions (event_id, organizer_id, event_snapshot, persons, amount_cents, currency, method, provider)
  values (e.id, e.owner_id,
          jsonb_build_object('title', e.title, 'date', e.event_date, 'short_id', e.short_id, 'simulated', true,
                             'expected', e.expected, 'pricing', pr ->> 'model'),
          (pr ->> 'persons')::int, (pr ->> 'amount_cents')::int, pr ->> 'currency', 'simulation', 'simulation')
  returning * into tx;
  perform private.event_log(e.id, private.actor_label(), 'Paiement simulé en attente : ' || tx.reference);
  return jsonb_build_object('ok', true, 'reference', tx.reference, 'event_id', e.id, 'amount_cents', tx.amount_cents, 'currency', tx.currency, 'resumed', false);
end $$;

-- Le nombre d'invités reste obligatoire (il sert à préparer les tables), mais ne fixe plus le prix.
create or replace function private.require_guest_count() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origin = 'organizer' and current_user = 'authenticated' and new.expected < 1
     and (tg_op = 'INSERT' or new.expected is distinct from old.expected) then
    raise exception 'Indiquez le nombre d''invités (un nombre entier, au moins 1).' using errcode = '23514';
  end if;
  return new;
end $$;

-- tarif public : le prix unique par événement
create or replace function public.public_pricing()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select value from public.settings where key = 'event_price'
$$;

-- ---------- paramètres : validation du prix unique (les autres paramètres sont inchangés) ----------
create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('settings.write') then return private.deny('settings.update', 'setting', p_key, 'settings.write'); end if;
  if p_key = 'retention' then
    if jsonb_typeof(p_value -> 'enabled') is distinct from 'boolean' or jsonb_typeof(p_value -> 'days') is distinct from 'number'
       or (p_value ->> 'days')::numeric not between 1 and 3650 or coalesce(p_value ->> 'from', '') not in ('creation', 'event_date') then
      raise exception 'Règle de conservation invalide.' using errcode = '22023';
    end if;
    p_value := jsonb_build_object('enabled', (p_value ->> 'enabled')::boolean, 'days', (p_value ->> 'days')::numeric::int, 'from', p_value ->> 'from');
  elsif p_key = 'event_price' then
    if jsonb_typeof(p_value -> 'cents') is distinct from 'number' or (p_value ->> 'cents')::numeric not between 1 and 1000000
       or coalesce(p_value ->> 'currency', '') not in ('USD', 'CDF', 'EUR') then
      raise exception 'Tarif invalide.' using errcode = '22023';
    end if;
    p_value := jsonb_build_object('currency', p_value ->> 'currency', 'cents', (p_value ->> 'cents')::numeric::int);
  elsif p_key = 'pricing' then -- ancien tarif par tranche : conservé pour l'historique, plus utilisé pour aucun calcul
    if jsonb_typeof(p_value -> 'unit_cents') is distinct from 'number' or jsonb_typeof(p_value -> 'unit_persons') is distinct from 'number'
       or (p_value ->> 'unit_cents')::numeric not between 1 and 1000000 or (p_value ->> 'unit_persons')::numeric not between 1 and 10000
       or coalesce(p_value ->> 'currency', '') not in ('USD', 'CDF', 'EUR') then
      raise exception 'Tarif invalide.' using errcode = '22023';
    end if;
    p_value := jsonb_build_object('currency', p_value ->> 'currency', 'unit_cents', (p_value ->> 'unit_cents')::numeric::int, 'unit_persons', (p_value ->> 'unit_persons')::numeric::int);
  elsif p_key = 'staff_limits' then
    if jsonb_typeof(p_value -> 'max_controllers') is distinct from 'number' or jsonb_typeof(p_value -> 'max_servers') is distinct from 'number'
       or (p_value ->> 'max_controllers')::numeric not between 0 and 200 or (p_value ->> 'max_servers')::numeric not between 0 and 500 then
      raise exception 'Limites invalides.' using errcode = '22023';
    end if;
    p_value := jsonb_build_object('max_controllers', (p_value ->> 'max_controllers')::numeric::int, 'max_servers', (p_value ->> 'max_servers')::numeric::int);
  else
    raise exception 'Paramètre inconnu.' using errcode = '22023';
  end if;
  update public.settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform private.audit('settings.update', 'setting', p_key, 'success', jsonb_build_object('value', p_value));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- traces conservées après suppression : nombre d'invitations générées en plus ----------
-- NULL pour les lignes déjà enregistrées (nombre inconnu à l'époque, jamais inventé).
alter table public.event_history add column if not exists invitations int check (invitations is null or invitations >= 0);

-- Même suppression qu'avant ; seule la trace conservée gagne le nombre d'invitations générées.
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
  insert into public.event_history (event_id, title, guests, invitations, amount_cents, currency)
  values (e.id, e.title,
    greatest(e.expected, coalesce((select sum(seats) from public.guests where event_id = e.id), 0)),
    (select count(*) from public.guests where event_id = e.id),
    coalesce((select sum(amount_cents) from public.transactions where event_id = e.id and status = 'succeeded'), 0),
    coalesce((select max(currency) from public.transactions where event_id = e.id and status = 'succeeded'),
             e.price_currency, (select value ->> 'currency' from public.settings where key = 'event_price'), 'USD'))
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

create or replace function public.admin_event_history(p_search text default '', p_sort text default 'recent', p_page int default 1, p_size int default 25)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := '%' || lower(coalesce(p_search, '')) || '%'; fin boolean := private.has_perm('finance.read'); res jsonb; tot jsonb;
begin
  if not private.has_perm('reports.read') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  p_size := least(greatest(p_size, 1), 100); p_page := greatest(p_page, 1);
  select jsonb_build_object('count', count(*), 'guests', coalesce(sum(guests), 0), 'invitations', coalesce(sum(invitations), 0),
         'amount_cents', case when fin then coalesce(sum(amount_cents), 0) end,
         'currency', coalesce(max(currency), (select value ->> 'currency' from public.settings where key = 'event_price')))
    into tot from public.event_history where lower(title) like q;
  select coalesce(jsonb_agg(x), '[]') into res from (
    select title, guests, invitations, case when fin then amount_cents end as amount_cents, currency, deleted_at
      from public.event_history where lower(title) like q
     order by case when p_sort = 'title' then lower(title) end asc,
              case when p_sort = 'guests' then guests end desc,
              case when p_sort = 'invitations' then invitations end desc nulls last,
              case when p_sort = 'amount' and fin then amount_cents end desc,
              case when p_sort = 'oldest' then deleted_at end asc,
              deleted_at desc
     offset (p_page - 1) * p_size limit p_size) x;
  return jsonb_build_object('ok', true, 'total', (tot ->> 'count')::int, 'totals', tot, 'items', res, 'finance', fin);
end $$;

-- ---------- droits d'exécution (inchangés ; rappelés pour les fonctions remplacées) ----------
revoke execute on function private.event_price(uuid), private.event_flat_price(), private.event_offered(public.events),
  private.invitations_open(public.events), private.activate_offered_draft(public.events) from public, anon, authenticated;
revoke execute on function public.event_billing(uuid), public.create_checkout(uuid, public.tx_method, text), public.start_simulated_checkout(uuid),
  public.activate_offered_event(uuid), public.admin_update_setting(text, jsonb), public.admin_event_history(text, text, int, int) from public, anon;
grant execute on function public.event_billing(uuid), public.create_checkout(uuid, public.tx_method, text), public.start_simulated_checkout(uuid),
  public.activate_offered_event(uuid), public.admin_update_setting(text, jsonb), public.admin_event_history(text, text, int, int) to authenticated;
revoke execute on function public.public_pricing() from public;
grant execute on function public.public_pricing() to anon, authenticated;
