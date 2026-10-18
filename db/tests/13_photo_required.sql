-- Tests : au moins une photo par invitation. S'exécute après 10, 11 et 12.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer)
values ('00000000-0000-0000-0000-0000000000a1', 'Sans Photo', current_date + 30, 'Salle C', 'Rue C', 6, 'none');
insert into public.t_vars select 'np', id::text from public.events where title = 'Sans Photo';
insert into public.guests (event_id, name, kind, whatsapp, table_no) select v::uuid, 'Mr Photo', 'mr', '+243810000077', 1 from public.t_vars where k = 'np';

-- règlement confirmé, mais aucune photo : envoi refusé
do $$ declare r jsonb := public.create_checkout((select v::uuid from public.t_vars where k = 'np'), 'card', 'stripe'); begin insert into public.t_vars values ('tx_np', r ->> 'reference'); end $$;
reset role; set role service_role;
select public.apply_payment_event('stripe', 'evt-np', (select v from public.t_vars where k = 'tx_np'), 'succeeded', 'pi_np', 500, '{}');
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'np'); g uuid := (select id from public.guests where name = 'Mr Photo'); begin
  assert (public.event_billing(e) ->> 'can_send')::boolean, 'règlement attendu';
  begin perform public.mark_invitations_sent(e, array[g]); raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('réglé mais sans photo : envoi refusé par la base'); end;
  assert (select whatsapp_opened_at is null from public.guests where id = g);
end $$;

-- une photo ajoutée : envoi accepté
update public.events set photos = array['np/1.jpg'] where title = 'Sans Photo';
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'np'); g uuid := (select id from public.guests where name = 'Mr Photo'); r jsonb; begin
  r := public.mark_invitations_sent(e, array[g]);
  assert (r ->> 'marked')::int = 1, r::text;
  perform t_ok('avec une photo : envoi accepté');
end $$;

-- on ne peut pas retirer la dernière photo ; remplacer (ajouter puis retirer) fonctionne
do $$ begin
  begin update public.events set photos = '{}' where title = 'Sans Photo'; raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('impossible de retirer la dernière photo'); end;
  update public.events set photos = array['np/1.jpg', 'np/2.jpg'] where title = 'Sans Photo';
  update public.events set photos = array['np/2.jpg'] where title = 'Sans Photo';
  assert (select photos = array['np/2.jpg'] from public.events where title = 'Sans Photo');
  perform t_ok('remplacer une photo (ajouter puis retirer) reste possible');
end $$;
