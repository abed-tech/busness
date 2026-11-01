-- =====================================================================
-- Wonya Pay : mobile money RDC (opérateur détecté par Wonya depuis le préfixe du numéro).
-- Le client confirme la demande sur son téléphone ; aucune page de paiement hébergée.
-- Utilisé à la place de CinetPay pour « mobile_money » quand WONYAPAY_TOKEN est configuré.
-- =====================================================================

alter table public.transactions drop constraint if exists transactions_provider_check;
alter table public.transactions add constraint transactions_provider_check check (provider in ('stripe', 'cinetpay', 'wonyapay', 'simulation'));

-- Calcul du montant identique à la version précédente ; seul le prestataire mobile money accepté change.
create or replace function public.create_checkout(p_event uuid, p_method public.tx_method, p_provider text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events; pr jsonb; persons int; units int; amount int; paid int; tx public.transactions;
begin
  select * into e from public.events where id = p_event;
  if not found or e.owner_id is distinct from auth.uid() or e.billing <> 'paid' or e.status not in ('active', 'draft') then
    raise exception 'Paiement impossible pour cet événement.' using errcode = '42501';
  end if;
  if p_provider not in ('stripe', 'cinetpay', 'wonyapay') or (p_method = 'card' and p_provider <> 'stripe')
     or (p_method = 'mobile_money' and p_provider not in ('cinetpay', 'wonyapay')) then
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

-- Identifiant Wonya (12 chiffres) mémorisé dès l'envoi de la demande : il permet de relire le statut auprès de Wonya
-- si la notification n'arrive pas (forfait sans reprises automatiques). Appelé uniquement par le serveur.
create or replace function public.attach_provider_ref(p_reference text, p_provider text, p_provider_ref text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.transactions set provider_ref = p_provider_ref
   where reference = p_reference and provider = p_provider and status = 'pending' and provider_ref is null;
  return jsonb_build_object('ok', found);
end $$;

revoke execute on function public.attach_provider_ref(text, text, text) from public, anon, authenticated;
grant execute on function public.attach_provider_ref(text, text, text) to service_role;
