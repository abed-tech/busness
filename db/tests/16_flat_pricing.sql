-- Tests : prix unique par événement (20 $), anciens événements protégés. S'exécute après 10 à 15.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------- nouvel événement : prix figé à la création, jamais choisi par le navigateur ----------
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin insert into public.events (owner_id, title, event_date, venue, address, expected, price_cents)
    values ('00000000-0000-0000-0000-0000000000a1', 'Prix forcé', current_date + 10, 'S', 'A', 5, 1); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('le prix ne peut pas être choisi par le navigateur'); end;
end $$;
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, photos, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Gala Unique', current_date + 40, 'Salle U', 'Rue U', 10, 'none', array['u/1.jpg'], 900);
insert into public.t_vars select 'flat', id::text from public.events where title = 'Gala Unique';
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'flat'); b jsonb; r jsonb; begin
  begin update public.events set price_cents = 1 where id = e; raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  b := public.event_billing(e);
  assert b ->> 'model' = 'flat' and (b ->> 'due_cents')::int = 2000 and b ->> 'currency' = 'USD' and not (b ->> 'can_send')::boolean, b::text;
  r := public.create_checkout(e, 'card', 'stripe');
  assert (r ->> 'amount_cents')::int = 2000, r::text;
  insert into public.t_vars values ('flat_tx', r ->> 'reference');
  perform t_ok('nouvel événement : 20 $ quel que soit le nombre d''invités (900 ici), prix non modifiable');
end $$;
reset role; set role service_role;
select public.apply_payment_event('stripe', 'evt-flat', (select v from public.t_vars where k = 'flat_tx'), 'succeeded', 'pi_flat', 2000, '{}');
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'flat'); b jsonb; r jsonb; begin
  assert (select status from public.events where id = e) = 'active', 'paiement confirmé : événement non activé';
  update public.events set expected = 5000 where id = e;
  insert into public.guests (event_id, name, kind) select e, 'Invité ' || i, 'couple' from generate_series(1, 30) i;
  b := public.event_billing(e);
  assert (b ->> 'remaining_cents')::int = 0 and (b ->> 'can_send')::boolean, b::text;
  r := public.create_checkout(e, 'mobile_money', 'wonyapay');
  assert not (r ->> 'ok')::boolean, 'second paiement demandé pour le même événement';
  perform t_ok('paiement unique : plus d''invités ou d''invitations ne demande aucun complément');
end $$;

-- ---------- un second événement du même organisateur se paie à part ----------
insert into public.events (owner_id, title, event_date, venue, address, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Deuxième Fête', current_date + 50, 'S', 'A', 10);
do $$ declare b jsonb := public.event_billing((select id from public.events where title = 'Deuxième Fête')); begin
  assert (b ->> 'due_cents')::int = 2000 and (b ->> 'paid_cents')::int = 0, b::text;
  perform t_ok('chaque événement se règle séparément');
end $$;

-- ---------- événements enregistrés avant le prix unique (prix vide) : tous offerts ----------
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, photos, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Ancien Actif', current_date + 30, 'S', 'A', 10, 'none', array['o/1.jpg'], 120),
       ('00000000-0000-0000-0000-0000000000a1', 'Ancien Brouillon', current_date + 30, 'S', 'A', 10, 'none', '{}', 120),
       ('00000000-0000-0000-0000-0000000000a1', 'Ancien Simulé', current_date + 30, 'S', 'A', 10, 'none', array['s/1.jpg'], 40);
reset role; -- reproduit l'état d'événements enregistrés avant la migration (dont un déjà actif, jamais payé)
update public.events set price_cents = null, price_currency = null where title in ('Ancien Actif', 'Ancien Brouillon', 'Ancien Simulé');
update public.events set status = 'active', activated_at = now() where title = 'Ancien Actif';
insert into public.t_vars select 'old_act', id::text from public.events where title = 'Ancien Actif';
insert into public.t_vars select 'old_draft', id::text from public.events where title = 'Ancien Brouillon';
insert into public.t_vars select 'old_sim', id::text from public.events where title = 'Ancien Simulé';
insert into public.guests (event_id, name, kind, whatsapp, table_no) select v::uuid, 'Mr Ancien', 'mr', '+243810000555', 1 from public.t_vars where k = 'old_act';
insert into public.t_vars select 'tok_old', invite_token from public.guests where name = 'Mr Ancien';
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'old_act'); b jsonb; r jsonb; begin
  update public.events set expected = 5000 where id = e;
  b := public.event_billing(e);
  assert b ->> 'model' = 'offered' and (b ->> 'free')::boolean and (b ->> 'due_cents')::int = 0 and (b ->> 'can_send')::boolean, b::text;
  r := public.create_checkout(e, 'card', 'stripe');
  assert not (r ->> 'ok')::boolean, 'paiement demandé pour un événement offert';
  r := public.mark_invitations_sent(e, array[(select id from public.guests where name = 'Mr Ancien')]);
  assert (r ->> 'marked')::int = 1, r::text;
  assert (select price_cents is null from public.events where id = e), 'nouveau prix appliqué rétroactivement';
  perform t_ok('événement existant : offert, envoi ouvert sans paiement, aucun prix imposé, invités illimités');
end $$;
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ begin
  assert public.get_invitation((select v from public.t_vars where k = 'tok_old')) is not null, 'invitation d''un événement offert fermée';
  perform t_ok('événement existant offert : lien d''invitation ouvert');
end $$;
-- brouillon existant : créé sans paiement à la fin de sa création, avec les mêmes contrôles (photo exigée)
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  begin perform public.activate_offered_event((select v::uuid from public.t_vars where k = 'old_draft')); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
end $$;
select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'old_draft'); r jsonb; begin
  begin perform public.activate_offered_event(e); raise exception 'ÉCHEC';
  exception when check_violation then null; end; -- aucune photo
  assert (select status from public.events where id = e) = 'draft';
  update public.events set photos = array['d/1.jpg'] where id = e;
  r := public.activate_offered_event(e);
  assert (r ->> 'ok')::boolean and not (r ->> 'already_active')::boolean, r::text;
  assert (select status from public.events where id = e) = 'active';
  assert (public.activate_offered_event(e) ->> 'already_active')::boolean, 'rejeu non idempotent';
  assert not exists (select 1 from public.transactions where event_id = e), 'transaction créée pour un événement offert';
  r := public.activate_offered_event((select v::uuid from public.t_vars where k = 'flat'));
  assert (r ->> 'already_active')::boolean, r::text; -- déjà payé et actif : rien à faire
  r := public.start_simulated_checkout((select v::uuid from public.t_vars where k = 'old_sim'));
  assert (r ->> 'already_active')::boolean and (r ->> 'offered')::boolean, r::text;
  assert (select status from public.events where id = (select v::uuid from public.t_vars where k = 'old_sim')) = 'active';
  perform t_ok('brouillon existant : créé sans paiement (photo exigée), autre organisateur refusé, rejeu sans effet');
end $$;
-- un brouillon au prix unique ne peut pas passer par l'activation offerte
insert into public.events (owner_id, title, event_date, venue, address, photos, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Nouveau Brouillon', current_date + 30, 'S', 'A', array['n/1.jpg'], 10);
do $$ declare e uuid := (select id from public.events where title = 'Nouveau Brouillon'); r jsonb := public.activate_offered_event(e); begin
  assert not (r ->> 'ok')::boolean and (select status from public.events where id = e) = 'draft', r::text;
  perform t_ok('nouvel événement : jamais activé sans paiement');
end $$;

-- ---------- événement offert par l'administration : aucun prix ----------
reset role;
do $$ begin
  assert exists (select 1 from public.events where billing = 'free_admin')
     and not exists (select 1 from public.events where billing = 'free_admin' and price_cents is not null);
  perform t_ok('événement offert : aucun prix enregistré');
end $$;

-- ---------- le prix modifié par l'administration ne touche que les événements créés ensuite ----------
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
select public.admin_update_setting('event_price', '{"currency":"USD","cents":2500}');
select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.events (owner_id, title, event_date, venue, address, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Après Changement', current_date + 60, 'S', 'A', 10);
do $$ begin
  assert (public.event_billing((select id from public.events where title = 'Après Changement')) ->> 'due_cents')::int = 2500;
  assert (public.event_billing((select v::uuid from public.t_vars where k = 'flat')) ->> 'due_cents')::int = 2000;
  perform t_ok('nouveau prix : appliqué aux événements créés ensuite uniquement');
end $$;
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
select public.admin_update_setting('event_price', '{"currency":"USD","cents":2000}');

-- ---------- trace conservée : nombre d'invitations générées ----------
do $$ declare r jsonb; begin
  r := public.admin_delete_event((select v::uuid from public.t_vars where k = 'flat'), 'Gala Unique'); assert (r ->> 'ok')::boolean, r::text;
end $$;
reset role;
do $$ declare h public.event_history; begin
  select * into h from public.event_history where event_id = (select v::uuid from public.t_vars where k = 'flat');
  assert h.title = 'Gala Unique' and h.guests = 5000 and h.invitations = 30 and h.amount_cents = 2000 and h.deleted_at is not null, row_to_json(h)::text;
  perform t_ok('suppression : nom, invités, invitations générées, montant payé et date conservés');
end $$;
do $$ begin raise notice 'Tests du prix unique passés.'; end $$;
