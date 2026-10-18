-- Socle de la plateforme sur un PostgreSQL standard (Render) — s'exécute AVANT toutes les autres migrations.
-- Remplace ce que fournissait Supabase : rôles d'accès, schéma « auth » (comptes, sessions, second facteur, jetons),
-- fonctions auth.uid() / auth.jwt() utilisées par les règles RLS. Les migrations suivantes restent inchangées.
-- Idempotent : peut être rejoué sans effet.

-- ---------- rôles d'accès (le serveur bascule sur l'un d'eux pour chaque requête : les règles RLS s'appliquent) ----------
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      begin
        execute format('create role %I nologin', r);
      exception when insufficient_privilege then
        raise exception 'Le compte de la base ne peut pas créer le rôle « % » (droit CREATEROLE requis).', r
          using hint = 'Voir docs/DEPLOIEMENT-RENDER.md, section « Base de données ».';
      end;
    end if;
    -- le compte propriétaire doit pouvoir faire « SET ROLE » vers ces rôles (PostgreSQL 16+ : option SET)
    if current_setting('server_version_num')::int >= 160000 then
      if not pg_has_role(current_user, r, 'SET') then execute format('grant %I to %I with set true, inherit false', r, current_user); end if;
    elsif not pg_has_role(current_user, r, 'MEMBER') then
      execute format('grant %I to %I', r, current_user);
    end if;
  end loop;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ---------- comptes ----------
-- Colonnes compatibles avec l'ancien schéma Supabase (données de démonstration, tests, import éventuel).
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text,                      -- bcrypt (pgcrypto), jamais lisible par les rôles d'accès
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  instance_id uuid, aud text, role text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  confirmation_token text, email_change text, email_change_token_new text, recovery_token text
);
create unique index if not exists users_email_key on auth.users (lower(email));

create table if not exists auth.identities (
  id uuid primary key, user_id uuid references auth.users (id) on delete cascade, provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, unique (provider_id, provider)
);

-- ---------- sessions (jeton aléatoire dans un cookie httpOnly ; seule son empreinte SHA-256 est stockée) ----------
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app text not null check (app in ('org', 'admin')),
  token_hash bytea not null unique,
  aal text not null default 'aal1' check (aal in ('aal1', 'aal2')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text, user_agent text
);
create index if not exists sessions_user_idx on auth.sessions (user_id);
create index if not exists sessions_expires_idx on auth.sessions (expires_at);

-- ---------- second facteur TOTP (application d'authentification) ----------
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  secret text not null,                          -- base32, lu uniquement par le serveur
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  last_used_step bigint,                         -- empêche de rejouer le même code
  created_at timestamptz not null default now()
);
create index if not exists mfa_factors_user_idx on auth.mfa_factors (user_id);

-- ---------- jetons à usage unique (confirmation d'e-mail, réinitialisation du mot de passe) ----------
create table if not exists auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('confirm', 'recovery')),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- limitation des tentatives de connexion des organisateurs (l'admin a la sienne) ----------
create table if not exists auth.failed_logins (
  id bigserial primary key,
  email_hash bytea not null,
  at timestamptz not null default now()
);
create index if not exists failed_logins_idx on auth.failed_logins (email_hash, at);

-- Aucun droit sur ces tables pour les rôles d'accès : seul le serveur (compte propriétaire) les lit.
revoke all on all tables in schema auth from anon, authenticated, service_role;

-- ---------- identité de la requête (posée par le serveur dans chaque transaction) ----------
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

-- ---------- suivi des migrations appliquées ----------
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
revoke all on public.schema_migrations from anon, authenticated, service_role;
