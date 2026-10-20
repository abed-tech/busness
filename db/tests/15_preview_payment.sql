-- Tests : création en brouillon, paiement simulé, création définitive après paiement, historique des suppressions.
-- S'exécute après 10 à 14 (réutilise les comptes et t_ok / t_claims).
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------- brouillon : quoi que le client envoie, l'événement d'un organisateur commence non payé ----------
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer)
    values ('00000000-0000-0000-0000-0000000000a1', 'Sans nombre', current_date + 10, 'S', 'A', 8, 'none'); raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('nombre d''invités manquant (0) refusé par la base'); end;
  begin insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, expected)
    values ('00000000-0000-0000-0000-0000000000a1', 'Négatif', current_date + 10, 'S', 'A', 8, 'none', -3); raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('nombre d''invités négatif refusé'); end;
  begin insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, expected, status)
    values ('00000000-0000-0000-0000-0000000000a1', 'Statut forcé', current_date + 10, 'S', 'A', 8, 'none', 5, 'active'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('le statut ne peut pas être choisi par le navigateur'); end;
end $$;
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Noces Sim', current_date + 60, 'Salle S', 'Rue S', 10, 'drinks', 120);
insert into public.t_vars select 'sim', id::text from public.events where title = 'Noces Sim';
insert into public.catalog_items (event_id, kind, name) select v::uuid, 'drink', 'Eau' from public.t_vars where k = 'sim';
insert into public.guests (event_id, name, kind, whatsapp) select v::uuid, 'Couple Sim', 'couple', '+243810000444' from public.t_vars where k = 'sim';
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); begin
  assert (select status from public.events where id = e) = 'draft', 'un événement d''organisateur doit commencer en brouillon';
  assert (select activated_at is null from public.events where id = e);
  begin update public.events set expected = 0 where id = e; raise exception 'ÉCHEC';
  exception when check_violation then null; end;
  begin perform public.create_staff(e, 'controller', 'Trop tôt', 'secret12'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  begin perform public.start_simulated_checkout(e); raise exception 'ÉCHEC';
  exception when check_violation then null; end; -- aucune photo
  perform t_ok('brouillon : modifiable par son créateur, sans accès du jour J ni paiement avant la photo');
end $$;
reset role; insert into public.t_vars select 'tok_sim', invite_token from public.guests where name = 'Couple Sim';
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ begin
  assert public.get_invitation((select v from public.t_vars where k = 'tok_sim')) is null, 'invitation d''un brouillon ouverte';
  begin perform public.start_simulated_checkout((select v::uuid from public.t_vars where k = 'sim')); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  begin perform public.complete_simulated_payment('CRM-X', 'succeeded'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('brouillon : invitation fermée ; un anonyme ne peut ni démarrer ni confirmer un paiement');
end $$;

-- ---------- paiement simulé : montant calculé par la base, reprise sans doublon ----------
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
update public.events set photos = array['sim/1.jpg'] where title = 'Noces Sim';
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); r jsonb; r2 jsonb; begin
  r := public.start_simulated_checkout(e);
  -- 120 invités, tarif 5 $ par tranche de 50 → 3 tranches → 15 $
  assert (r ->> 'amount_cents')::int = 1500, r::text;
  r2 := public.start_simulated_checkout(e);
  assert r2 ->> 'reference' = r ->> 'reference' and (r2 ->> 'resumed')::boolean, 'double clic : second paiement créé';
  assert (select count(*) from public.transactions where event_id = e) = 1;
  insert into public.t_vars values ('sim_tx1', r ->> 'reference');
  perform t_ok('récapitulatif : montant calculé par le serveur (120 invités → 15 $), double clic sans doublon');
end $$;
-- échec puis annulation : aucun événement actif, nouvel essai possible
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); r jsonb; begin
  r := public.complete_simulated_payment((select v from public.t_vars where k = 'sim_tx1'), 'failed');
  assert r ->> 'status' = 'failed', r::text;
  assert (select status from public.events where id = e) = 'draft', 'échec : événement activé';
  r := public.complete_simulated_payment((select v from public.t_vars where k = 'sim_tx1'), 'succeeded');
  assert not (r ->> 'ok')::boolean, 'un paiement échoué ne peut pas être confirmé ensuite';
  r := public.start_simulated_checkout(e);
  assert r ->> 'reference' <> (select v from public.t_vars where k = 'sim_tx1');
  r := public.complete_simulated_payment(r ->> 'reference', 'cancelled');
  assert r ->> 'status' = 'cancelled' and (select status from public.events where id = e) = 'draft';
  perform t_ok('paiement échoué ou annulé : aucun événement actif, nouvel essai sans recommencer');
end $$;
-- le nombre d'invités change après le récapitulatif : le paiement est annulé, jamais confirmé à l'ancien montant
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); r jsonb; ref text; begin
  ref := public.start_simulated_checkout(e) ->> 'reference';
  update public.events set expected = 180 where id = e;
  r := public.complete_simulated_payment(ref, 'succeeded');
  assert not (r ->> 'ok')::boolean and r ->> 'status' = 'cancelled', r::text;
  assert (select status from public.events where id = e) = 'draft';
  perform t_ok('montant recalculé à la confirmation : un récapitulatif périmé est refusé');
end $$;
-- un autre organisateur ne peut pas confirmer ce paiement
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); begin
  insert into public.t_vars values ('sim_tx4', public.start_simulated_checkout(e) ->> 'reference');
end $$;
select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  begin perform public.complete_simulated_payment((select v from public.t_vars where k = 'sim_tx4'), 'succeeded'); raise exception 'ÉCHEC';
  exception when no_data_found then perform t_ok('paiement d''un autre organisateur introuvable'); end;
  begin perform public.start_simulated_checkout((select v::uuid from public.t_vars where k = 'sim')); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
end $$;
-- un organisateur ne peut pas modifier lui-même une transaction ni le statut de l'événement
select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; begin
  begin update public.transactions set status = 'succeeded' where reference = (select v from public.t_vars where k = 'sim_tx4'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  begin update public.events set status = 'active' where id = (select v::uuid from public.t_vars where k = 'sim'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('requêtes directes : ni transaction ni statut modifiables pour contourner le paiement');
end $$;
-- réussite : création définitive, une seule fois
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); r jsonb; ref text := (select v from public.t_vars where k = 'sim_tx4'); begin
  assert (select amount_cents from public.transactions where reference = ref) = 2000; -- 180 invités → 4 tranches
  r := public.complete_simulated_payment(ref, 'succeeded');
  assert (r ->> 'ok')::boolean and r ->> 'status' = 'succeeded', r::text;
  assert (select status from public.events where id = e) = 'active', 'paiement réussi : événement non activé';
  assert (select activated_at is not null from public.events where id = e);
  r := public.complete_simulated_payment(ref, 'succeeded');
  assert (r ->> 'already')::boolean, r::text;
  r := public.start_simulated_checkout(e);
  assert (r ->> 'already_active')::boolean;
  assert (select count(*) from public.transactions where event_id = e and status = 'succeeded') = 1, 'paiement compté deux fois';
  assert (select count(*) from public.events where title = 'Noces Sim') = 1;
  assert (public.event_billing(e) ->> 'can_send')::boolean;
  perform public.create_staff(e, 'controller', 'Ctl Sim', 'secret12');
  perform t_ok('paiement simulé réussi : un seul événement créé, fonctions de gestion ouvertes, rejeu sans effet');
end $$;
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ begin
  assert public.get_invitation((select v from public.t_vars where k = 'tok_sim')) is not null;
  perform t_ok('après paiement : invitation et lien de partage actifs');
end $$;

-- ---------- tableau de bord : un brouillon n'est jamais compté comme événement ----------
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Brouillon Abandonné', current_date + 90, 'S', 'A', 8, 'none', 40);
insert into public.t_vars select 'abd', id::text from public.events where title = 'Brouillon Abandonné';
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ declare d jsonb := public.admin_dashboard(); l jsonb; begin
  assert (d -> 'events' ->> 'drafts')::int = 1, d::text;
  assert (d -> 'events' ->> 'active')::int = (select count(*) from public.events where status = 'active');
  l := public.admin_list_events();
  assert not exists (select 1 from jsonb_array_elements(l -> 'items') x where x ->> 'status' = 'draft'), 'brouillon dans la liste des événements';
  l := public.admin_list_events(p_status => 'draft');
  assert (l ->> 'total')::int = 1;
  assert jsonb_array_length(d -> 'series') = 12;
  assert (public.admin_notifications() ->> 'ok')::boolean;
  perform t_ok('administration : brouillons exclus des événements actifs, filtrables à part ; séries sur 12 mois');
end $$;

-- ---------- historique statistique des événements supprimés ----------
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); r jsonb; begin
  r := public.admin_delete_event(e, 'Noces Sim'); assert (r ->> 'ok')::boolean, r::text;
end $$;
reset role;
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'sim'); h public.event_history; begin
  select * into h from public.event_history where event_id = e;
  assert found, 'historique absent';
  assert h.title = 'Noces Sim' and h.guests = 180 and h.amount_cents = 2000, row_to_json(h)::text;
  assert row_to_json(h)::text not like '%Couple Sim%' and row_to_json(h)::text not like '%+243%', 'donnée personnelle dans l''historique';
  perform private.purge_event(e); -- rejouer la suppression ne compte rien deux fois
  assert (select count(*) from public.event_history where event_id = e) = 1;
  perform t_ok('suppression : nom, nombre d''invités et montant conservés, sans donnée personnelle ni double comptage');
end $$;
-- le brouillon abandonné : effacé entièrement, sans statistique
reset role; -- vieillissement artificiel : le déclencheur events_touch remettrait updated_at à maintenant
alter table public.events disable trigger events_touch;
update public.events set updated_at = now() - interval '31 days' where title = 'Brouillon Abandonné';
alter table public.events enable trigger events_touch;
set role service_role;
do $$ declare r jsonb := public.purge_stale_drafts(30); begin assert (r ->> 'purged')::int = 1, r::text; end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.events where id = (select v::uuid from public.t_vars where k = 'abd'));
  assert not exists (select 1 from public.event_history where event_id = (select v::uuid from public.t_vars where k = 'abd'));
  perform t_ok('brouillon abandonné effacé entièrement, jamais compté comme événement');
end $$;
-- lecture de l'historique : montants réservés à finance.read
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b3', 'aal2');
do $$ declare r jsonb := public.admin_event_history(); begin
  assert (r ->> 'ok')::boolean and (r -> 'totals' ->> 'amount_cents') is not null, r::text;
  assert exists (select 1 from jsonb_array_elements(r -> 'items') x where x ->> 'title' = 'Noces Sim' and (x ->> 'amount_cents')::int = 2000);
end $$;
select t_claims('00000000-0000-0000-0000-0000000000b2', 'aal2');
do $$ declare r jsonb := public.admin_event_history(); begin
  assert (r ->> 'ok')::boolean and not exists (select 1 from jsonb_array_elements(r -> 'items') x where x ->> 'amount_cents' is not null), r::text;
end $$;
select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (public.admin_event_history() ->> 'ok')::boolean = false;
  begin perform count(*) from public.event_history; raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('historique : montants pour les rôles finances seulement ; organisateurs exclus');
end $$;
-- revenu : les transactions restent la seule source, l'historique ne s'y ajoute pas
select t_claims('00000000-0000-0000-0000-0000000000b3', 'aal2');
do $$ declare d jsonb := public.admin_dashboard(); begin
  assert (d -> 'finance' ->> 'revenue_cents')::int = (select coalesce(sum(amount_cents), 0) from public.transactions where status = 'succeeded' and confirmed_at >= date_trunc('month', now())), d::text;
  perform t_ok('revenus calculés sur les paiements enregistrés, sans double comptabilisation');
end $$;
reset role;
do $$ begin raise notice 'Tests de l''aperçu, du paiement simulé et de l''historique passés.'; end $$;
