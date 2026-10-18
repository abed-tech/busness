-- Tests : comptes administrateurs séparés, gestion par e-mail, validation des paramètres.
-- S'exécute après 10_security_tests.sql (réutilise ses comptes et ses fonctions t_ok / t_claims).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b4', 'nouveau@test');

-- un organisateur ne peut pas être promu administrateur, même par insertion directe en base
do $$ begin
  begin insert into public.admin_users (user_id, role, display_name) values ('00000000-0000-0000-0000-0000000000a1', 'super', 'Pirate');
    raise exception 'ÉCHEC : organisateur promu';
  exception when check_violation then perform t_ok('un compte organisateur ne peut jamais devenir administrateur'); end;
  begin insert into public.profiles (id, username) values ('00000000-0000-0000-0000-0000000000b2', 'Modo');
    raise exception 'ÉCHEC : administrateur devenu organisateur';
  exception when check_violation then perform t_ok('un compte administrateur ne peut pas devenir organisateur'); end;
end $$;

set role authenticated;
-- modérateur et gestionnaire : aucune gestion des administrateurs
select t_claims('00000000-0000-0000-0000-0000000000b2', 'aal2');
do $$ begin
  assert (public.admin_list_admins() ->> 'error') = 'forbidden';
  assert (public.admin_grant_by_email('nouveau@test', 'super', 'Moi') ->> 'error') = 'forbidden';
  perform t_ok('le modérateur ne peut ni lister ni nommer des administrateurs');
end $$;
-- administrateur principal sans second facteur : refusé
select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal1');
do $$ begin assert (public.admin_list_admins() ->> 'error') = 'forbidden'; perform t_ok('sans MFA (aal2), aucune gestion des administrateurs'); end $$;

select t_claims('00000000-0000-0000-0000-0000000000b1', 'aal2');
do $$ declare r jsonb; begin
  r := public.admin_list_admins();
  assert jsonb_array_length(r -> 'items') = 3, r::text;
  assert (public.admin_grant_by_email('inconnu@test', 'manager', 'X Y') ->> 'error') = 'no_account';
  assert (public.admin_grant_by_email('org1@test', 'manager', 'Org Un') ->> 'error') = 'organizer_account';
  assert (public.admin_grant_by_email('NOUVEAU@test', 'manager', 'Nouveau gestionnaire') ->> 'ok')::boolean;
  assert (select role from public.admin_users where user_id = '00000000-0000-0000-0000-0000000000b4') = 'manager';
  assert (public.admin_grant_by_email('nouveau@test', 'manager', 'Nouveau gestionnaire', false) ->> 'ok')::boolean;
  assert not (select active from public.admin_users where user_id = '00000000-0000-0000-0000-0000000000b4');
  perform t_ok('nomination par e-mail : compte inexistant et compte organisateur refusés, désactivation possible');
end $$;
do $$ begin
  assert (public.admin_set_role('00000000-0000-0000-0000-0000000000b1', 'moderator', true, 'Admin Principal') ->> 'error') = 'last_super';
  perform t_ok('le dernier administrateur principal ne peut pas se rétrograder');
end $$;

-- validation des paramètres
do $$ begin
  begin perform public.admin_update_setting('retention', '{"enabled":"oui","days":7,"from":"creation"}'); raise exception 'ÉCHEC';
  exception when invalid_parameter_value then null; end;
  begin perform public.admin_update_setting('pricing', '{"currency":"USD","unit_cents":0,"unit_persons":50}'); raise exception 'ÉCHEC';
  exception when invalid_parameter_value then null; end;
  begin perform public.admin_update_setting('inconnu', '{}'); raise exception 'ÉCHEC';
  exception when invalid_parameter_value then null; end;
  assert (public.admin_update_setting('pricing', '{"currency":"USD","unit_cents":500,"unit_persons":50,"extra":"x"}') ->> 'ok')::boolean;
  assert not ((select value from public.settings where key = 'pricing') ? 'extra');
  assert (public.admin_update_setting('retention', '{"enabled":false,"days":7,"from":"creation"}') ->> 'ok')::boolean;
  perform t_ok('paramètres validés et nettoyés côté serveur');
end $$;

-- le journal a tout enregistré et reste inaltérable
do $$ begin
  assert (select count(*) from public.audit_log where action = 'admin.role' and result = 'denied') >= 2;
  begin delete from public.audit_log; raise exception 'ÉCHEC';
  exception when insufficient_privilege or raise_exception then
    if sqlerrm = 'ÉCHEC' then raise; end if;
  end;
  perform t_ok('refus journalisés ; le journal ne peut pas être effacé');
end $$;
-- connexions admin journalisées, fonction inaccessible depuis le navigateur
do $$ begin
  begin perform public.admin_login_record('x@test', '1.2.3.4', true); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
end $$;
reset role; set role service_role;
select public.admin_login_record('super@test', '1.2.3.4', false);
reset role; -- lecture de contrôle par le propriétaire
do $$ begin
  assert (select count(*) from public.audit_log where action = 'auth.admin_login' and result = 'denied' and details ->> 'ip' = '1.2.3.4') = 1;
  assert not exists (select 1 from public.audit_log where details::text like '%super@test%'), 'e-mail en clair dans le journal';
  perform t_ok('tentatives de connexion admin journalisées sans e-mail en clair ; fonction réservée au serveur');
end $$;
reset role;
do $$ begin raise notice 'Tests des comptes administrateurs passés.'; end $$;
