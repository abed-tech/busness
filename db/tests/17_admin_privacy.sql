-- =====================================================================
-- Confidentialité : l'administrateur principal (avec second facteur) n'a aucun privilège caché.
-- Invités, invitations, contenu et données d'authentification lui sont fermés ; il ne modifie ni ne supprime
-- aucun événement. Il garde la gestion des administrateurs, des paramètres, des statistiques et la suspension.
-- =====================================================================
\set ON_ERROR_STOP 1

-- ---------- jeu de données : un événement actif complet de l'organisateur a1 ----------
reset role;
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, expected, status, host_a, host_b, message, program, dress)
values ('00000000-0000-0000-0000-0000000000a1', 'Mariage Privé', current_date + 50, 'Salle P', 'Avenue Secrète 7', 10, 'both', 4, 'active',
        'Prénom-A', 'Prénom-B', 'Message intime', '18:00 | Programme privé', 'Tenue privée');
insert into public.t_vars select 'priv', id::text from public.events where title = 'Mariage Privé';
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.guests (event_id, name, kind, whatsapp) select v::uuid, 'Invitée Confidentielle', 'mme', '+243899999999' from public.t_vars where k = 'priv';
insert into public.catalog_items (event_id, kind, name) select v::uuid, 'drink', 'Boisson privée' from public.t_vars where k = 'priv';
do $$ declare r jsonb; begin
  r := public.create_staff((select v::uuid from public.t_vars where k = 'priv'), 'controller', 'Contrôleur Secret', 'secret99');
  insert into public.t_vars values ('priv_staff', r ->> 'id');
  assert (select count(*) from public.guests where event_id = (select v::uuid from public.t_vars where k = 'priv')) = 1;
  perform t_ok('l''organisateur gère son événement normalement (invités, catalogue, accès)');
end $$;

-- ---------- 1. matrice : aucune permission de confidentialité, pour aucun rôle ----------
reset role;
do $$ begin
  assert not exists (select 1 from public.role_permissions where perm in ('guests.read', 'events.write', 'events.delete')), 'permission interdite dans la matrice';
  assert (select count(*) from private.role_permissions_removed where role = 'super' and perm in ('guests.read', 'events.write', 'events.delete')) = 3, 'sauvegarde absente';
  begin insert into public.role_permissions values ('super', 'guests.read'); raise exception 'ÉCHEC : permission rendue';
  exception when insufficient_privilege then null; end;
  begin update public.role_permissions set perm = 'events.write' where role = 'super' and perm = 'events.read'; raise exception 'ÉCHEC : permission rendue';
  exception when insufficient_privilege then null; end;
  perform t_ok('matrice : permissions retirées (sauvegardées), impossibles à rendre, même par une migration');
end $$;
-- même forcée dans la table (déclencheur désactivé), la permission reste refusée par la vérification
alter table public.role_permissions disable trigger role_permissions_privacy;
insert into public.role_permissions values ('super', 'guests.read'), ('super', 'events.write');
alter table public.role_permissions enable trigger role_permissions_privacy;
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ begin
  assert not private.has_perm('guests.read') and not private.has_perm('events.write'), 'barrière contournée';
  assert (select count(*) from public.guests) = 0, 'invités lisibles avec une permission forcée';
  perform t_ok('une permission interdite ajoutée de force reste sans effet');
end $$;
reset role;
delete from public.role_permissions where perm in ('guests.read', 'events.write');

-- ---------- 2. administrateur principal : aucune lecture des données privées ----------
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'priv'); begin
  assert private.has_perm('admins.manage') and private.has_perm('settings.write'), 'l''administrateur principal doit garder sa gestion';
  assert (select count(*) from public.guests) = 0, 'invités';
  assert (select count(*) from public.guest_orders) = 0, 'choix des invités';
  assert (select count(*) from public.entries) = 0 and (select count(*) from public.services) = 0, 'entrées ou prestations';
  assert (select count(*) from public.events) = 0, 'contenu des événements (adresse, message, programme, photos)';
  assert (select count(*) from public.catalog_items) = 0, 'catalogue';
  assert (select count(*) from public.staff_accounts) = 0, 'accès du jour J';
  assert (select count(*) from public.event_log) = 0, 'journal de l''événement';
  begin perform public.event_stats(e); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  assert public.service_totals(e) is null, 'commandes par table';
  begin perform public.event_billing(e); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  perform t_ok('administrateur principal : invités, invitations, choix, accès et contenu illisibles');
end $$;

-- ---------- 3. aucune modification ni suppression ----------
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'priv'); r jsonb; n int; begin
  update public.events set title = 'Piraté', message = 'x' where id = e; get diagnostics n = row_count; assert n = 0, 'événement modifié';
  update public.guests set name = 'Piraté' where event_id = e; get diagnostics n = row_count; assert n = 0, 'invité modifié';
  delete from public.guests where event_id = e; get diagnostics n = row_count; assert n = 0, 'invité supprimé';
  begin insert into public.guests (event_id, name) values (e, 'Intrus'); raise exception 'ÉCHEC : invité ajouté';
  exception when insufficient_privilege then null; end;
  begin perform public.save_table_plan(e, '{}'); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform public.create_staff(e, 'server', 'Intrus', 'secret12'); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform public.reset_staff_password((select v::uuid from public.t_vars where k = 'priv_staff'), 'pirate12'); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform public.delete_staff((select v::uuid from public.t_vars where k = 'priv_staff')); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform public.rotate_service_key(e); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform public.delete_my_event(e, 'Mariage Privé'); raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  r := public.admin_update_event(e, '{"title":"Piraté","event_date":"2027-01-01","venue":"V","address":"A","table_capacity":10,"expected":1}');
  assert r ->> 'error' = 'forbidden', r::text;
  r := public.admin_delete_event(e, 'Mariage Privé'); assert r ->> 'error' = 'forbidden', r::text;
  perform t_ok('administrateur principal : aucune modification ni suppression d''événement, d''invité ou d''accès');
end $$;
reset role;
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'priv'); begin
  assert (select title = 'Mariage Privé' and message = 'Message intime' and status = 'active' from public.events where id = e), 'événement altéré';
  assert (select count(*) from public.guests where event_id = e and name = 'Invitée Confidentielle') = 1, 'invité altéré';
  assert (select count(*) from public.staff_accounts where event_id = e) = 1, 'accès altéré';
  assert (select count(*) from public.audit_log where details ->> 'rule' = 'admin_privacy' and actor_role = 'super' and result = 'denied' and object_id = e::text) = 2, 'refus non journalisés';
  perform t_ok('données intactes ; refus inscrits au journal');
end $$;

-- ---------- 4. fiche admin : métadonnées et totaux seulement ----------
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ declare r jsonb := public.admin_event_detail((select v::uuid from public.t_vars where k = 'priv')); t text; begin
  assert (r ->> 'ok')::boolean, r::text;
  t := r::text;
  assert t not like '%Avenue Secrète%' and t not like '%Message intime%' and t not like '%Programme privé%' and t not like '%Tenue privée%'
     and t not like '%Prénom-A%' and t not like '%Invitée Confidentielle%' and t not like '%+243899999999%' and t not like '%Contrôleur Secret%'
     and t not like '%org1@test%' and t not like '%Boisson privée%', 'donnée privée dans la fiche admin : ' || t;
  assert not (r -> 'event') ? 'service_key' and not (r -> 'event') ? 'photos';
  assert (r -> 'stats' ->> 'invitations')::int = 1 and (r -> 'staff' ->> 'controllers')::int = 1, r::text;
  perform t_ok('fiche admin : titre, date, statut et totaux ; ni invités, ni contenu, ni coordonnées, ni noms du personnel');
end $$;

-- ---------- 5. données d'authentification et usurpation ----------
do $$ begin
  begin perform count(*) from auth.users; raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform count(*) from auth.sessions; raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform secret from auth.mfa_factors; raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin insert into auth.sessions (user_id, app, token_hash) values ('00000000-0000-0000-0000-0000000000a1', 'org', decode('00', 'hex')); raise exception 'ÉCHEC : session créée';
  exception when insufficient_privilege then null; end;
  begin perform password_hash from public.staff_accounts; raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.staff_sessions; raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  begin perform count(*) from private.role_permissions_removed; raise exception 'ÉCHEC'; exception when insufficient_privilege then null; end;
  perform t_ok('mots de passe, sessions et jetons illisibles ; aucune session d''organisateur ne peut être créée');
end $$;

-- ---------- 6. ce qui reste permis : administration, statistiques, suspension motivée ----------
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'priv'); r jsonb; begin
  assert (public.admin_dashboard() ->> 'ok')::boolean and (public.admin_list_admins() ->> 'ok')::boolean and (public.admin_list_events() ->> 'ok')::boolean;
  begin perform public.admin_set_event_status(e, 'suspended', ''); raise exception 'ÉCHEC'; exception when invalid_parameter_value then null; end;
  r := public.admin_set_event_status(e, 'suspended', 'Signalement vérifié'); assert (r ->> 'ok')::boolean, r::text;
  r := public.admin_set_event_status(e, 'active', ''); assert (r ->> 'ok')::boolean, r::text;
  perform t_ok('administration, statistiques et suspension motivée (journalisée) toujours disponibles');
end $$;
select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.guests where event_id = (select v::uuid from public.t_vars where k = 'priv')) = 1;
  assert (public.event_stats((select v::uuid from public.t_vars where k = 'priv')) ->> 'invitations')::int = 1;
  perform t_ok('l''organisateur garde l''accès complet à son événement');
end $$;
reset role;
do $$ begin raise notice 'Tests de confidentialité de l''administration passés.'; end $$;
