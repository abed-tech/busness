-- =====================================================================
-- Tests de sécurité et de cohérence (exécutés sur un vrai PostgreSQL).
-- Chaque bloc échoue bruyamment si une règle est violée.
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------- jeu de données ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'org1@test'), ('00000000-0000-0000-0000-0000000000a2', 'org2@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'super@test'), ('00000000-0000-0000-0000-0000000000b2', 'mod@test'),
  ('00000000-0000-0000-0000-0000000000b3', 'mgr@test');
insert into public.profiles (id, username, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'Organisateur Un', 'org1@test'), ('00000000-0000-0000-0000-0000000000a2', 'Organisatrice Deux', 'org2@test');
insert into public.admin_users (user_id, role, display_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'super', 'Admin Principal'), ('00000000-0000-0000-0000-0000000000b2', 'moderator', 'Modo'),
  ('00000000-0000-0000-0000-0000000000b3', 'manager', 'Gestion');

create or replace function public.t_ok(name text) returns void language plpgsql as $$ begin raise notice 'OK   %', name; end $$;
grant execute on function public.t_ok(text) to anon, authenticated, service_role;
create table public.t_vars (k text primary key, v text);
grant all on public.t_vars to anon, authenticated, service_role;

-- se connecter comme un utilisateur donné (rôle + jeton)
create or replace function public.t_claims(uid text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal, 'role', 'authenticated')::text, false) $$;
grant execute on function public.t_claims(text, text) to anon, authenticated, service_role;

-- ================= 1. Isolation entre organisateurs =================
set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer)
values ('00000000-0000-0000-0000-0000000000a1', 'Mariage Un', current_date + 30, 'Salle A', 'Rue A', 4, 'both');
insert into public.t_vars select 'e1', id::text from public.events where title = 'Mariage Un';
insert into public.catalog_items (event_id, kind, name) select v::uuid, 'drink', 'Coca' from t_vars where k = 'e1';
insert into public.catalog_items (event_id, kind, name) select v::uuid, 'drink', 'Nkoyi' from t_vars where k = 'e1';
insert into public.catalog_items (event_id, kind, name) select v::uuid, 'dish', 'Poulet' from t_vars where k = 'e1';
insert into public.guests (event_id, name, kind, whatsapp) select tv.v::uuid, g.n, g.gk::guest_kind, '+243810000001' from t_vars tv,
  (values ('Mr Luc', 'mr'), ('Couple Bola', 'couple'), ('Mme Lucie', 'mme'), ('Mr Paul', 'mr')) g(n, gk) where tv.k = 'e1';
do $$ begin assert (select count(*) from public.guests) = 4; perform t_ok('organisateur voit ses 4 invités'); end $$;

select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  assert (select count(*) from public.events) = 0, 'org2 voit un événement qui ne lui appartient pas';
  assert (select count(*) from public.guests) = 0, 'org2 voit des invités';
  assert (select count(*) from public.guest_orders) = 0;
  perform t_ok('un organisateur ne voit pas les événements ni les invités d''un autre');
end $$;
do $$ begin
  begin insert into public.guests (event_id, name) select v::uuid, 'Intrus' from public.t_vars where k = 'e1';
    raise exception 'ÉCHEC : insertion acceptée';
  exception when insufficient_privilege or check_violation then perform t_ok('un organisateur ne peut pas ajouter d''invité chez un autre'); end;
end $$;
do $$ declare r jsonb; begin
  select public.event_stats((select v::uuid from public.t_vars where k = 'e1')) into r; raise exception 'ÉCHEC stats';
exception when insufficient_privilege then perform t_ok('statistiques d''un autre événement refusées'); end $$;

-- ================= 2. Tables : capacité et couples =================
select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'e1'); begin
  -- 5 personnes (couple = 2) ; capacité 4 → 2 tables
  update public.guests set table_no = 1 where event_id = e and name in ('Mr Luc', 'Couple Bola', 'Mme Lucie');
  assert (select sum(seats) from public.guests where table_no = 1) = 4;
  begin update public.guests set table_no = 1 where name = 'Mr Paul'; raise exception 'ÉCHEC : table pleine acceptée';
  exception when check_violation then perform t_ok('capacité jamais dépassée (le couple compte 2 places)'); end;
  begin update public.guests set table_no = 9 where name = 'Mr Paul'; raise exception 'ÉCHEC : table inexistante acceptée';
  exception when check_violation then perform t_ok('table inexistante refusée'); end;
  begin perform public.save_table_plan(e, jsonb_build_object((select id from public.guests where name = 'Mr Paul')::text, 1, (select id from public.guests where name = 'Mr Luc')::text, 2));
  exception when check_violation then raise exception 'ÉCHEC : échange valide refusé'; end;
  assert (select table_no from public.guests where name = 'Mr Paul') = 1 and (select table_no from public.guests where name = 'Mr Luc') = 2;
  perform t_ok('échange groupé enregistré d''un seul coup');
  begin perform public.save_table_plan(e, jsonb_build_object((select id from public.guests where name = 'Mr Luc')::text, 1));
    raise exception 'ÉCHEC';
  exception when check_violation then null; end;
  assert (select table_no from public.guests where name = 'Mr Luc') = 2, 'le plan refusé a laissé des modifications';
  perform t_ok('plan invalide refusé sans aucune modification partielle');
  begin update public.events set table_capacity = 1 where id = e; raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('capacité réduite refusée si une table déborderait'); end;
end $$;

-- ================= 3. Rôles administrateurs et MFA =================
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal1');
do $$ begin
  assert (public.admin_dashboard() ->> 'ok')::boolean = false, 'tableau de bord sans MFA';
  assert (public.admin_create_event('{}') ->> 'error') = 'forbidden';
  perform t_ok('sans authentification multifacteur (aal1), aucune action admin');
end $$;
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ begin assert (public.admin_dashboard() ->> 'ok')::boolean; perform t_ok('administrateur principal avec MFA : tableau de bord'); end $$;
select t_claims('00000000-0000-0000-0000-0000000000a1', 'aal2');
do $$ begin
  assert (public.admin_dashboard() ->> 'ok')::boolean = false;
  assert (public.admin_list_events() ->> 'ok')::boolean = false;
  assert (select count(*) from public.audit_log) = 0;
  perform t_ok('un organisateur (même avec MFA) n''a accès à aucune fonction admin ni au journal');
end $$;

-- gestionnaire : consultation, pas de création, pas de données privées
select t_claims('00000000-0000-0000-0000-0000000000b3', 'aal2');
do $$ begin
  assert (public.admin_list_events() ->> 'ok')::boolean;
  assert (public.admin_create_event('{"mode":"platform","title":"X","event_date":"2027-01-01","venue":"V","address":"A","table_capacity":10}') ->> 'error') = 'forbidden';
  assert (select count(*) from public.guests) = 0, 'le gestionnaire voit les invités';
  assert (select count(*) from public.guest_orders) = 0;
  assert (public.admin_dashboard() -> 'finance') is not null, 'le gestionnaire doit voir les finances';
  assert (public.admin_set_event_status((select v::uuid from public.t_vars where k = 'e1'), 'suspended', 'test') ->> 'error') = 'forbidden';
  perform t_ok('gestionnaire : consultation et finances, sans création, suspension ni données des invités');
end $$;
reset role;
do $$ begin assert (select count(*) from public.audit_log where result = 'denied' and actor_role = 'manager') = 2; perform t_ok('les refus sont inscrits au journal'); end $$;
set role authenticated;

-- modérateur : événements oui, finances non, choix des invités non
select t_claims('00000000-0000-0000-0000-0000000000b2', 'aal2');
do $$ declare r jsonb; begin
  assert (public.admin_dashboard() -> 'finance') = 'null'::jsonb or (public.admin_dashboard() -> 'finance') is null, 'le modérateur voit les finances';
  assert (public.admin_transactions() ->> 'ok')::boolean = false;
  assert (select count(*) from public.guests) = 4, 'le modérateur doit voir les invités (assistance)';
  assert (select count(*) from public.guest_orders) = 0, 'le modérateur voit les choix individuels';
  select public.admin_create_event('{"mode":"platform","title":"Gala Plateforme","event_date":"2027-02-01","venue":"Hôtel","address":"Bd","table_capacity":10,"offer":"drinks","drinks":["Eau","Jus"]}') into r;
  assert (r ->> 'ok')::boolean, r::text;
  insert into public.t_vars values ('ep', r ->> 'id');
  select public.admin_create_event(jsonb_build_object('mode','for_organizer','organizer_id','00000000-0000-0000-0000-0000000000a2','title','Anniversaire Offert','event_date','2027-03-01','venue','Salle','address','Av','table_capacity',8)) into r;
  assert (r ->> 'ok')::boolean, r::text;
  insert into public.t_vars values ('eo', r ->> 'id');
  perform t_ok('modérateur : création d''événements (plateforme et pour un organisateur), sans finances ni choix des invités');
end $$;
reset role;
do $$ begin
  assert (select billing from public.events where id = (select v::uuid from public.t_vars where k = 'ep')) = 'free_admin';
  assert (select owner_id is null and organizer_id = '00000000-0000-0000-0000-0000000000a2' and origin = 'admin_for_organizer' from public.events where id = (select v::uuid from public.t_vars where k = 'eo'));
  assert (select count(*) from public.transactions) = 0, 'un événement gratuit a créé une transaction';
  assert (select count(*) from public.catalog_items where event_id = (select v::uuid from public.t_vars where k = 'ep')) = 2;
  perform t_ok('événements admin gratuits : aucune transaction, organisateur associé sans transfert de propriété');
end $$;
set role authenticated;
select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  assert (select count(*) from public.events) = 1, 'org2 doit voir l''événement créé pour lui';
  assert (select billing from public.events) = 'free_admin';
  perform t_ok('l''organisateur associé voit et gère l''événement créé pour lui');
end $$;

-- ================= 4. Journal inaltérable =================
reset role;
do $$ begin
  begin update public.audit_log set result = 'success'; raise exception 'ÉCHEC : journal modifié';
  exception when insufficient_privilege then perform t_ok('journal non modifiable, même par le propriétaire de la base'); end;
  begin delete from public.audit_log; raise exception 'ÉCHEC : journal supprimé';
  exception when insufficient_privilege then perform t_ok('journal non supprimable'); end;
end $$;

-- ================= 7. Paiements : revenus = paiements confirmés =================
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare r jsonb; begin
  r := public.create_checkout((select v::uuid from public.t_vars where k = 'e1'), 'mobile_money', 'cinetpay');
  assert (r ->> 'amount_cents')::int = 500, r::text;
  insert into public.t_vars values ('tx1', r ->> 'reference');
  r := public.create_checkout((select v::uuid from public.t_vars where k = 'e1'), 'card', 'stripe');
  insert into public.t_vars values ('tx2', r ->> 'reference');
  begin perform public.apply_payment_event('stripe', 'x', 'y', 'succeeded', null, 1, '{}'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('un organisateur ne peut pas confirmer un paiement lui-même'); end;
  perform t_ok('montant calculé par le serveur (5 personnes → 5 $)');
end $$;
select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  begin perform public.create_checkout((select v::uuid from public.t_vars where k = 'eo'), 'card', 'stripe'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('un événement gratuit offert ne peut pas générer de paiement'); end;
end $$;
reset role; set role service_role;
do $$ declare r jsonb; begin
  r := public.apply_payment_event('cinetpay', 'evt-1', (select v from public.t_vars where k = 'tx1'), 'succeeded', 'CP-1', 400, '{"proof":1}');
  assert r ->> 'error' = 'amount_mismatch', r::text;
  r := public.apply_payment_event('cinetpay', 'evt-2', (select v from public.t_vars where k = 'tx1'), 'succeeded', 'CP-1', 500, '{"proof":2}');
  assert (r ->> 'ok')::boolean, r::text;
  r := public.apply_payment_event('cinetpay', 'evt-2', (select v from public.t_vars where k = 'tx1'), 'succeeded', 'CP-1', 500, '{"proof":2}');
  assert (r ->> 'duplicate')::boolean, 'doublon de webhook non détecté';
  r := public.apply_payment_event('stripe', 'evt-3', (select v from public.t_vars where k = 'tx2'), 'failed', 'pi_1', 500, '{}');
  perform t_ok('webhooks : montant vérifié, doublons ignorés, échec enregistré');
end $$;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b3', 'aal2');
do $$ declare d jsonb := public.admin_dashboard(); t jsonb := public.admin_transactions(); begin
  assert (d -> 'finance' ->> 'revenue_cents')::int = 500, d::text;
  assert (t -> 'summary' ->> 'succeeded')::int = 1 and (t -> 'summary' ->> 'failed')::int = 1, t::text;
  perform t_ok('revenu du mois = paiements confirmés uniquement (gratuits et échecs exclus)');
end $$;

-- ================= 5. Invité : réponse et choix validés côté serveur =================
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ declare tok text; coca uuid; poulet uuid; bad uuid := gen_random_uuid(); r jsonb; begin
  reset role;
  select invite_token into tok from public.guests where name = 'Couple Bola';
  select id into coca from public.catalog_items where name = 'Coca';
  select id into poulet from public.catalog_items where name = 'Poulet';
  insert into public.t_vars values ('tok_bola', tok), ('tok_luc', (select invite_token from public.guests where name = 'Mr Luc')), ('tok_paul', (select invite_token from public.guests where name = 'Mr Paul'));
  set role anon;
  assert (public.get_invitation(tok) -> 'guest' ->> 'seats')::int = 2;
  begin perform public.submit_rsvp(tok, 'yes', array[coca], array[poulet, poulet]); raise exception 'ÉCHEC';
  exception when invalid_parameter_value then perform t_ok('couple : une boisson par personne exigée'); end;
  begin perform public.submit_rsvp(tok, 'yes', array[coca, bad], array[poulet, poulet]); raise exception 'ÉCHEC';
  exception when invalid_parameter_value then perform t_ok('produit hors catalogue refusé'); end;
  perform public.submit_rsvp(tok, 'yes', array[coca, coca], array[poulet, poulet]);
  perform public.submit_rsvp((select v from public.t_vars where k = 'tok_luc'), 'yes', array[coca], array[poulet]);
  assert (public.get_invitation(tok) -> 'guest' ->> 'rsvp') = 'yes';
  begin perform count(*) from public.guests; raise exception 'ÉCHEC : anonyme lit les invités';
  exception when insufficient_privilege then perform t_ok('un anonyme ne lit aucune table directement'); end;
  perform t_ok('confirmation de présence avec choix valides');
end $$;

-- ================= 6. Personnel : connexion, rôles, entrées, prestations =================
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare r jsonb; e uuid := (select v::uuid from public.t_vars where k = 'e1'); begin
  r := public.create_staff(e, 'controller', 'Jean', 'secret12'); insert into public.t_vars values ('ctl', r ->> 'id'), ('ctl_code', r ->> 'access_code');
  r := public.create_staff(e, 'controller', 'Paul', 'secret34'); insert into public.t_vars values ('ctl2', r ->> 'id'), ('ctl2_code', r ->> 'access_code');
  r := public.create_staff(e, 'server', 'Marie', 'serveur1'); insert into public.t_vars values ('srv', r ->> 'id'), ('srv_code', r ->> 'access_code');
  assert (select count(*) from public.staff_accounts) = 3;
  begin perform password_hash from public.staff_accounts; raise exception 'ÉCHEC : hash lisible';
  exception when insufficient_privilege then perform t_ok('le mot de passe haché n''est jamais lisible'); end;
  perform t_ok('création des accès contrôleur et serveur');
end $$;
reset role;
do $$ begin assert (select password_hash like '$2a$%' from public.staff_accounts limit 1); perform t_ok('mots de passe hachés avec bcrypt'); end $$;
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ declare r jsonb; sh text; i int; begin
  reset role; select short_id into sh from public.events where title = 'Mariage Un'; insert into public.t_vars values ('short', sh); set role anon;
  r := public.staff_login(sh, (select v::uuid from public.t_vars where k = 'ctl'), (select v from public.t_vars where k = 'ctl_code'), 'mauvais');
  assert (r ->> 'ok')::boolean = false;
  r := public.staff_login(sh, (select v::uuid from public.t_vars where k = 'ctl'), (select v from public.t_vars where k = 'ctl_code'), 'secret12');
  assert (r ->> 'ok')::boolean, r::text; insert into public.t_vars values ('tok_ctl', r ->> 'token');
  r := public.staff_login(sh, (select v::uuid from public.t_vars where k = 'srv'), (select v from public.t_vars where k = 'srv_code'), 'serveur1');
  insert into public.t_vars values ('tok_srv', r ->> 'token');
  r := public.staff_login(sh, (select v::uuid from public.t_vars where k = 'ctl2'), (select v from public.t_vars where k = 'ctl2_code'), 'secret34');
  insert into public.t_vars values ('tok_ctl2', r ->> 'token');
  -- blocage après 5 essais
  for i in 1..5 loop r := public.staff_login(sh, (select v::uuid from public.t_vars where k = 'srv'), (select v from public.t_vars where k = 'srv_code'), 'faux' || i); end loop;
  r := public.staff_login(sh, (select v::uuid from public.t_vars where k = 'srv'), (select v from public.t_vars where k = 'srv_code'), 'serveur1');
  assert (r ->> 'ok')::boolean = false and r ->> 'error' like 'Trop de tentatives%', r::text;
  perform t_ok('connexion du personnel : mot de passe vérifié, blocage après 5 essais');
end $$;
do $$ declare r jsonb; tc text := (select v from public.t_vars where k = 'tok_ctl'); ts text := (select v from public.t_vars where k = 'tok_srv'); g uuid; c text; begin
  reset role; select id, code into g, c from public.guests where name = 'Couple Bola'; set role anon;
  r := public.staff_lookup(tc, lower(c));
  assert (r ->> 'valid')::boolean and (r ->> 'persons')::int = 2, r::text;
  assert r ? 'drinks' = false, 'le contrôleur voit les commandes';
  r := public.staff_lookup(ts, 'CRM2:' || (select v from public.t_vars where k = 'tok_bola'));
  assert (r -> 'drinks') = '["Coca","Coca"]'::jsonb, r::text;
  assert r ? 'entered_at' = false;
  begin perform public.staff_confirm_entry(ts, g); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('un serveur ne peut pas valider une entrée'); end;
  begin perform public.staff_mark_served(tc, g, 'drink'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('un contrôleur ne peut pas enregistrer une prestation'); end;
  r := public.staff_confirm_entry(tc, g); assert r ->> 'status' = 'confirmed', r::text;
  r := public.staff_confirm_entry((select v from public.t_vars where k = 'tok_ctl2'), g); assert r ->> 'status' = 'already', r::text;
  perform t_ok('entrée confirmée une seule fois ; le second contrôleur voit « déjà validée »');
end $$;
do $$ begin perform public.staff_confirm_entry((select v from public.t_vars where k = 'tok_ctl'), gen_random_uuid()); raise exception 'ÉCHEC';
exception when no_data_found then perform t_ok('invitation inconnue refusée'); end $$;
do $$ declare r jsonb; tc text := (select v from public.t_vars where k = 'tok_ctl'); ts text := (select v from public.t_vars where k = 'tok_srv'); g uuid; paul uuid; begin
  reset role; select id into g from public.guests where name = 'Couple Bola'; select id into paul from public.guests where name = 'Mr Paul'; set role anon;
  r := public.staff_confirm_entry(tc, paul); assert r ->> 'status' = 'unconfirmed', 'invité non confirmé admis';
  perform t_ok('invité sans confirmation : entrée refusée');
  r := public.staff_mark_served(ts, g, 'drink'); assert r ->> 'status' = 'served';
  r := public.staff_mark_served(ts, g, 'drink'); assert r ->> 'status' = 'already';
  perform t_ok('boisson servie comptée une seule fois');
  begin perform public.submit_rsvp((select v from public.t_vars where k = 'tok_bola'), 'no'); raise exception 'ÉCHEC';
  exception when insufficient_privilege then perform t_ok('après l''entrée, l''invité ne peut plus changer sa réponse'); end;
  begin perform public.staff_lookup(tc, 'CRM2:' || (select v from public.t_vars where k = 'tok_paul') || 'x'); raise exception 'ÉCHEC';
  exception when no_data_found then perform t_ok('QR inconnu refusé'); end;
end $$;
-- invitation d'un autre événement
reset role;
insert into public.guests (event_id, name, kind) select v::uuid, 'Invité ailleurs', 'mr' from public.t_vars where k = 'ep';
insert into public.t_vars select 'tok_other', invite_token from public.guests where name = 'Invité ailleurs';
set role anon;
do $$ begin
  perform public.staff_lookup((select v from public.t_vars where k = 'tok_ctl'), 'CRM2:' || (select v from public.t_vars where k = 'tok_other')); raise exception 'ÉCHEC';
exception when insufficient_privilege then perform t_ok('QR d''un autre événement refusé'); end $$;

-- statistiques
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
do $$ declare s jsonb := public.event_stats((select v::uuid from public.t_vars where k = 'e1')); begin
  assert (s -> 'presence' ->> 'persons')::int = 2, s::text;
  assert (s -> 'drinks' ->> 'planned')::int = 3 and (s -> 'drinks' ->> 'served')::int = 2, s::text;
  assert (s -> 'dishes' ->> 'planned')::int = 3 and (s -> 'dishes' ->> 'served')::int = 0, s::text;
  perform t_ok('suivis exacts : 2 présents, boissons 2/3 servies, plats 0/3 (indépendants)');
end $$;
-- révocation
do $$ begin perform public.set_staff_revoked((select v::uuid from public.t_vars where k = 'ctl'), true); end $$;
set role anon;
do $$ begin
  perform public.staff_lookup((select v from public.t_vars where k = 'tok_ctl'), 'ABCDEF'); raise exception 'ÉCHEC';
exception when invalid_authorization_specification then perform t_ok('accès révoqué : session invalidée immédiatement'); end $$;

-- ================= 8. Suppression : preuves conservées =================
reset role; set role authenticated;
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ declare r jsonb; e uuid := (select v::uuid from public.t_vars where k = 'e1'); begin
  r := public.admin_delete_event(e, 'Mauvais titre'); assert r ->> 'error' = 'confirmation';
  r := public.admin_delete_event(e, 'Mariage Un'); assert (r ->> 'ok')::boolean, r::text;
  perform t_ok('suppression après confirmation du titre');
end $$;
reset role;
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'e1'); begin
  assert (select count(*) from public.guests where event_id = e) = 0;
  assert (select count(*) from public.entries where event_id = e) = 0;
  assert (select count(*) from public.transactions where event_id = e) = 2, 'transactions perdues';
  assert (select count(*) from public.payment_events) = 3, 'preuves de paiement perdues (dont le webhook au montant incorrect)';
  assert (select status from public.events where id = e) = 'deleted';
  assert (select count(*) from public.audit_log where action = 'event.delete') = 1;
  perform t_ok('données opérationnelles supprimées ; transactions, preuves et journal conservés');
end $$;

-- ================= 9. Clôture mensuelle et rapports =================
reset role; set role service_role;
do $$ declare r jsonb; begin
  r := public.close_month((date_trunc('month', now()) - interval '1 month')::date); assert (r ->> 'ok')::boolean;
  begin perform public.close_month(date_trunc('month', now())::date); raise exception 'ÉCHEC';
  exception when invalid_parameter_value then perform t_ok('le mois en cours ne peut pas être clos'); end;
  perform public.close_month((date_trunc('month', now()) - interval '1 month')::date);
end $$;
reset role; -- lecture de contrôle par le propriétaire (le rôle serveur n'a aucun accès direct aux tables)
do $$ begin
  assert (select count(*) from public.monthly_reports) = 1, 'clôture non idempotente';
  perform t_ok('clôture mensuelle figée et idempotente (archives conservées)');
end $$;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b2', 'aal2');
do $$ declare r jsonb := public.admin_reports(); begin
  assert (r ->> 'ok')::boolean and (r ->> 'finance')::boolean = false;
  assert not ((r -> 'months' -> 0) ? 'revenue_cents'), 'le modérateur voit le chiffre d''affaires';
  perform t_ok('rapports du modérateur sans données financières');
end $$;

-- ================= 10. Conservation automatique =================
select t_claims('00000000-0000-0000-0000-0000000000b2', 'aal2');
do $$ begin assert (public.admin_update_setting('retention', '{"enabled":true,"days":7,"from":"creation"}') ->> 'error') = 'forbidden'; perform t_ok('seul l''administrateur principal modifie la conservation'); end $$;
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ begin assert (public.admin_update_setting('retention', '{"enabled":true,"days":7,"from":"creation"}') ->> 'ok')::boolean; end $$;
reset role;
update public.events set created_at = now() - interval '8 days' where id = (select v::uuid from public.t_vars where k = 'ep');
set role service_role;
do $$ declare r jsonb := public.purge_expired_events(); begin
  assert (r ->> 'purged')::int = 1, r::text;
  perform t_ok('règle de conservation appliquée aux événements expirés uniquement');
end $$;

-- ================= 11. Compte organisateur suspendu =================
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ begin assert (public.admin_set_organizer_status('00000000-0000-0000-0000-0000000000a2', 'suspended', 'Fraude suspectée') ->> 'ok')::boolean; end $$;
select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  assert (select count(*) from public.events) = 1, 'un compte suspendu doit encore consulter';
  begin insert into public.guests (event_id, name) select v::uuid, 'X' from public.t_vars where k = 'eo'; raise exception 'ÉCHEC';
  exception when insufficient_privilege or check_violation then perform t_ok('compte suspendu : consultation seule, aucune modification'); end;
end $$;
reset role;
do $$ begin raise notice 'Tous les tests de sécurité sont passés.'; end $$;
