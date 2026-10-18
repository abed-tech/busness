-- =====================================================================
-- Comptes administrateurs : séparation stricte avec les comptes organisateurs,
-- gestion des administrateurs par e-mail, validation de tous les paramètres.
-- =====================================================================

-- Un compte administrateur ne peut pas être un compte organisateur, et inversement.
-- (L'organisateur ne peut donc jamais obtenir de droits d'administration avec son compte.)
create or replace function private.admin_not_organizer() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id) then
    raise exception 'Ce compte est un compte organisateur : créez un compte distinct pour l''administration.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger admin_users_not_organizer before insert or update of user_id on public.admin_users
  for each row execute function private.admin_not_organizer();

create or replace function private.organizer_not_admin() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.admin_users where user_id = new.id) then
    raise exception 'Un compte administrateur ne peut pas devenir organisateur.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger profiles_not_admin before insert or update of id on public.profiles
  for each row execute function private.organizer_not_admin();

-- Liste des administrateurs (administrateur principal uniquement)
create or replace function public.admin_list_admins()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not private.has_perm('admins.manage') then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'items', (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'role', a.role, 'name', a.display_name,
             'active', a.active, 'created_at', a.created_at, 'me', a.user_id = auth.uid()) order by a.created_at), '[]')
      from public.admin_users a join auth.users u on u.id = a.user_id));
end $$;

-- Attribuer un rôle à un compte existant, désigné par son e-mail.
-- Le compte doit d'abord être invité dans Supabase Auth (jamais créé avec un mot de passe choisi par un tiers).
create or replace function public.admin_grant_by_email(p_email text, p_role public.admin_role, p_name text, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  if not private.has_perm('admins.manage') then return private.deny('admin.role', 'admin', lower(trim(p_email)), 'admins.manage'); end if;
  if char_length(coalesce(trim(p_name), '')) not between 2 and 80 then raise exception 'Nom affiché : 2 à 80 caractères.' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_account',
      'message', 'Aucun compte avec cet e-mail. Invitez d''abord la personne (Supabase → Authentication → Invite), puis attribuez le rôle.');
  end if;
  if exists (select 1 from public.profiles where id = uid) then
    perform private.audit('admin.role', 'admin', uid::text, 'denied', jsonb_build_object('why', 'organizer_account'));
    return jsonb_build_object('ok', false, 'error', 'organizer_account',
      'message', 'Ce compte est un compte organisateur. L''administration exige un compte distinct.');
  end if;
  return public.admin_set_role(uid, p_role, p_active, trim(p_name));
end $$;

-- Validation de chaque paramètre modifiable (remplace la version précédente).
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
  elsif p_key = 'pricing' then
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

revoke execute on function public.admin_list_admins(), public.admin_grant_by_email(text, public.admin_role, text, boolean) from public, anon;
grant execute on function public.admin_list_admins(), public.admin_grant_by_email(text, public.admin_role, text, boolean) to authenticated;

-- Connexions à l'administration : chaque tentative est aussi inscrite au journal (e-mail haché, jamais en clair).
create or replace function public.admin_login_record(p_email text, p_ip text, p_success boolean)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare h text := encode(digest(lower(trim(coalesce(p_email, ''))), 'sha256'), 'hex');
begin
  insert into public.admin_login_attempts (email_hash, ip, success) values (h, coalesce(p_ip, ''), p_success);
  insert into public.audit_log (actor_id, actor_label, actor_role, action, object_type, object_id, result, details)
  values (null, 'connexion admin', 'system', 'auth.admin_login', 'account', left(h, 12), case when p_success then 'success' else 'denied' end,
          jsonb_build_object('ip', coalesce(p_ip, '')));
end $$;
revoke execute on function public.admin_login_record(text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_login_record(text, text, boolean) to service_role;
