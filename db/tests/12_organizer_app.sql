-- Tests : application organisateur (règlement, ouverture des invitations, envoi, page Service, écrans du personnel).
-- S'exécute après 10 et 11 (réutilise les comptes et t_ok / t_claims).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, photos)
values ('00000000-0000-0000-0000-0000000000a1', 'Fête Deux', current_date + 20, 'Salle B', 'Rue B', 6, 'drinks', array['x/1.jpg']);
insert into public.t_vars select 'f2', id::text from public.events where title = 'Fête Deux';
insert into public.catalog_items (event_id, kind, name) select v::uuid, 'drink', 'Jus' from public.t_vars where k = 'f2';
insert into public.guests (event_id, name, kind, whatsapp, table_no) select v::uuid, 'Couple Kabila', 'couple', '+243810000009', 1 from public.t_vars where k = 'f2';
insert into public.guests (event_id, name, kind, table_no) select v::uuid, 'Mme Ngalula', 'mme', 1 from public.t_vars where k = 'f2';

do $$ begin
  begin insert into public.events (owner_id, title, event_date, venue, address, photos)
    values ('00000000-0000-0000-0000-0000000000a1', 'Trop de photos', current_date, 'S', 'A', array['1','2','3','4','5']); raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('4 photos au maximum'); end;
end $$;

do $$ declare b jsonb := public.event_billing((select v::uuid from public.t_vars where k = 'f2')); begin
  assert (b ->> 'persons')::int = 3 and (b ->> 'due_cents')::int = 500 and (b ->> 'remaining_cents')::int = 500 and not (b ->> 'can_send')::boolean, b::text;
  begin perform public.mark_invitations_sent((select v::uuid from public.t_vars where k = 'f2'), array[gen_random_uuid()]); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('envoi bloqué tant que le règlement n''est pas fait'); end;
end $$;

-- avant tout paiement confirmé, le lien d'invitation ne s'ouvre pas
reset role; insert into public.t_vars select 'tok_k', invite_token from public.guests where name = 'Couple Kabila'; set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ begin
  assert public.get_invitation((select v from public.t_vars where k = 'tok_k')) is null;
  begin perform public.submit_rsvp((select v from public.t_vars where k = 'tok_k'), 'no'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('événement non réglé : invitation fermée, réponse refusée'); end;
end $$;

-- paiement confirmé par le prestataire (webhook)
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare r jsonb := public.create_checkout((select v::uuid from public.t_vars where k = 'f2'), 'card', 'stripe'); begin insert into public.t_vars values ('tx_f2', r ->> 'reference'); end $$;
reset role; set role service_role;
select public.apply_payment_event('stripe', 'evt-f2', (select v from public.t_vars where k = 'tx_f2'), 'succeeded', 'pi_f2', 500, '{}');
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ declare inv jsonb := public.get_invitation((select v from public.t_vars where k = 'tok_k')); jus uuid; begin
  assert inv -> 'event' -> 'photos' = '["x/1.jpg"]'::jsonb, inv::text;
  jus := (inv -> 'catalog' -> 0 ->> 'id')::uuid;
  perform public.submit_rsvp((select v from public.t_vars where k = 'tok_k'), 'yes', array[jus, jus], '{}');
  perform t_ok('après paiement confirmé : invitation ouverte, photos transmises, réponse acceptée');
end $$;

reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'f2'); g uuid; r jsonb; begin
  assert (public.event_billing(e) ->> 'can_send')::boolean;
  select id into g from public.guests where name = 'Couple Kabila';
  r := public.mark_invitations_sent(e, array[g]);
  assert (r ->> 'marked')::int = 1 and (select whatsapp_opened_at is not null from public.guests where id = g);
  begin update public.guests set whatsapp_opened_at = null where id = g; raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('envoi enregistré par la fonction serveur uniquement');
end $$;

-- un autre organisateur ne voit pas le règlement
select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  begin perform public.event_billing((select v::uuid from public.t_vars where k = 'f2')); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('règlement invisible pour un autre organisateur'); end;
end $$;

-- page Service par lien : clé exigée, aucun nom, clé renouvelable
reset role; insert into public.t_vars select 'f2s', short_id from public.events where title = 'Fête Deux'; insert into public.t_vars select 'f2k', service_key from public.events where title = 'Fête Deux';
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ declare r jsonb; begin
  assert public.service_board((select v from public.t_vars where k = 'f2s'), 'mauvaise') is null;
  r := public.service_board((select v from public.t_vars where k = 'f2s'), (select v from public.t_vars where k = 'f2k'));
  assert r -> 'items' = '[{"qty": 2, "item": "Jus", "kind": "drink", "table": 1}]'::jsonb, r::text;
  assert r::text not like '%Kabila%', 'nom d''invité exposé';
  perform t_ok('page Service : clé exigée, quantités par table sans aucun nom');
end $$;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
select public.rotate_service_key((select v::uuid from public.t_vars where k = 'f2'));
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ begin
  assert public.service_board((select v from public.t_vars where k = 'f2s'), (select v from public.t_vars where k = 'f2k')) is null;
  perform t_ok('lien du service renouvelé : l''ancien ne fonctionne plus');
end $$;

-- écrans du personnel
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare r jsonb; e uuid := (select v::uuid from public.t_vars where k = 'f2'); begin
  r := public.create_staff(e, 'controller', 'Ctl F2', 'secret12'); insert into public.t_vars values ('f2c', r ->> 'id'), ('f2cc', r ->> 'access_code');
  r := public.create_staff(e, 'server', 'Srv F2', 'secret12'); insert into public.t_vars values ('f2v', r ->> 'id'), ('f2vc', r ->> 'access_code');
end $$;
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ declare tc text; tv text; o jsonb; g uuid; begin
  tc := public.staff_login((select v from public.t_vars where k = 'f2s'), (select v::uuid from public.t_vars where k = 'f2c'), (select v from public.t_vars where k = 'f2cc'), 'secret12') ->> 'token';
  tv := public.staff_login((select v from public.t_vars where k = 'f2s'), (select v::uuid from public.t_vars where k = 'f2v'), (select v from public.t_vars where k = 'f2vc'), 'secret12') ->> 'token';
  g := (public.staff_lookup(tc, 'CRM2:' || (select v from public.t_vars where k = 'tok_k')) ->> 'guest_id')::uuid;
  perform public.staff_confirm_entry(tc, g);
  o := public.staff_overview(tc);
  assert (o ->> 'entered_persons')::int = 2 and (o ->> 'expected_persons')::int = 2 and o -> 'recent' -> 0 ->> 'name' = 'Couple Kabila', o::text;
  perform public.staff_mark_served(tv, g, 'drink');
  o := public.staff_overview(tv);
  assert o -> 'drinks' = '{"planned": 2, "served": 2}'::jsonb and not (o ? 'recent'), o::text;
  begin perform public.staff_overview('jeton-invalide'); raise exception 'ÉCHEC';
  exception when invalid_authorization_specification then null; end;
  perform t_ok('écrans du personnel : compteurs exacts, aucun nom côté serveur, jeton exigé');
end $$;
do $$ begin
  assert (public.public_pricing() ->> 'unit_cents')::int = 500;
  begin perform value from public.settings; raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('tarif public lisible, autres paramètres inaccessibles');
end $$;
reset role;
do $$ begin raise notice 'Tests de l''application organisateur passés.'; end $$;
