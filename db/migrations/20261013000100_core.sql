-- =====================================================================
-- Cérémonia : schéma principal
-- Organisateurs, administrateurs, événements, invités, tables, catalogue,
-- commandes, accès du jour J, entrées, prestations.
-- Toutes les tables ont la sécurité au niveau des lignes (RLS) activée.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------- types ----------
create type public.admin_role as enum ('super', 'moderator', 'manager');
create type public.account_status as enum ('active', 'suspended');
create type public.event_status as enum ('active', 'suspended', 'deleted');
create type public.event_origin as enum ('organizer', 'admin_platform', 'admin_for_organizer');
create type public.billing_mode as enum ('paid', 'free_admin');
create type public.event_type as enum ('mariage', 'fiancailles', 'anniversaire', 'bapteme', 'gala', 'conference');
create type public.menu_offer as enum ('both', 'drinks', 'food', 'none');
create type public.guest_kind as enum ('mr', 'mme', 'couple');
create type public.rsvp_answer as enum ('yes', 'no');
create type public.catalog_kind as enum ('drink', 'dish');
create type public.staff_role as enum ('controller', 'server');
create type public.service_kind as enum ('drink', 'dish');

-- ---------- outils ----------
create or replace function private.short_id(n int default 8)
returns text language sql volatile as $$
  select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + (get_byte(b, i) % 36), 1), '')
  from (select extensions.gen_random_bytes(n) as b) r, generate_series(0, n - 1) as i
$$;

create or replace function private.token(n int default 18)
returns text language sql volatile as $$
  select translate(encode(extensions.gen_random_bytes(n), 'base64'), '+/=', '-_')
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- comptes ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 2 and 40),
  full_name text check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 20),
  email text check (char_length(email) <= 254),
  status public.account_status not null default 'active',
  status_reason text check (char_length(status_reason) <= 500),
  status_changed_at timestamptz,
  tutorials jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null,
  display_name text not null check (char_length(display_name) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

-- matrice des permissions (documentée dans docs/PERMISSIONS.md)
create table public.role_permissions (
  role public.admin_role not null,
  perm text not null,
  primary key (role, perm)
);

insert into public.role_permissions (role, perm)
select 'super'::public.admin_role, p from unnest(array[
  'dashboard.read','events.read','events.create','events.write','events.suspend','events.delete',
  'guests.read','organizers.read','organizers.suspend','finance.read','finance.refund',
  'reports.read','reports.export','audit.read','admins.manage','settings.write','security.read'
]) p
union all
select 'moderator', p from unnest(array[
  'dashboard.read','events.read','events.create','events.write','events.suspend','events.delete',
  'guests.read','organizers.read','organizers.suspend','reports.read','security.read'
]) p
union all
select 'manager', p from unnest(array[
  'dashboard.read','events.read','organizers.read','finance.read','reports.read','reports.export'
]) p;

-- ---------- paramètres ----------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
insert into public.settings (key, value) values
  ('retention', '{"enabled": false, "days": 7, "from": "creation"}'),
  ('pricing', '{"currency": "USD", "unit_cents": 500, "unit_persons": 50}'),
  ('staff_limits', '{"max_controllers": 10, "max_servers": 20}');

-- ---------- événements ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  short_id text not null unique default private.short_id(8),
  owner_id uuid references public.profiles (id) on delete set null,
  organizer_id uuid references public.profiles (id) on delete set null,
  organizer_can_manage boolean not null default true,
  origin public.event_origin not null default 'organizer',
  billing public.billing_mode not null default 'paid',
  created_by uuid references auth.users (id),
  status public.event_status not null default 'active',
  status_reason text check (char_length(status_reason) <= 500),
  type public.event_type not null default 'mariage',
  host_a text not null default '' check (char_length(host_a) <= 80),
  host_b text not null default '' check (char_length(host_b) <= 80),
  title text not null check (char_length(title) between 1 and 160),
  event_date date not null,
  event_time time not null default '16:00',
  venue text not null check (char_length(venue) between 1 and 160),
  address text not null check (char_length(address) between 1 and 300),
  dress text not null default '' check (char_length(dress) <= 160),
  message text not null default '' check (char_length(message) <= 2000),
  program text not null default '' check (char_length(program) <= 3000),
  expected int not null default 0 check (expected between 0 and 10000),
  table_capacity int not null default 10 check (table_capacity between 1 and 100),
  extra_tables int not null default 0 check (extra_tables between 0 and 500),
  phone_prefix text not null default '+243' check (phone_prefix ~ '^\+\d{1,4}$'),
  offer public.menu_offer not null default 'none',
  service_key text not null default private.short_id(8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- un événement d'organisateur a un propriétaire ; un événement de la plateforme n'en a pas
  constraint events_origin_owner check (
    (origin = 'organizer' and owner_id is not null and billing = 'paid')
    or (origin = 'admin_platform' and owner_id is null and organizer_id is null and billing = 'free_admin')
    or (origin = 'admin_for_organizer' and owner_id is null and organizer_id is not null and billing = 'free_admin')
  )
);
create index events_owner_idx on public.events (owner_id);
create index events_organizer_idx on public.events (organizer_id);
create index events_created_idx on public.events (created_at desc);
create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null default upper(private.short_id(6)),
  invite_token text not null unique default private.token(18),
  name text not null check (char_length(name) between 1 and 120),
  kind public.guest_kind,
  seats int generated always as (case when kind = 'couple' then 2 else 1 end) stored,
  whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^\+\d{8,15}$'),
  table_no int check (table_no is null or table_no >= 1),
  placed_manually boolean not null default false,
  rsvp public.rsvp_answer,
  rsvp_at timestamptz,
  whatsapp_opened_at timestamptz,
  sort_order double precision not null default extract(epoch from clock_timestamp()),
  created_at timestamptz not null default now(),
  unique (event_id, code)
);
create index guests_event_idx on public.guests (event_id);
create index guests_table_idx on public.guests (event_id, table_no);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind public.catalog_kind not null,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index catalog_unique_name on public.catalog_items (event_id, kind, lower(name));

-- choix individuels : jamais visibles du personnel ni des administrateurs (agrégats uniquement)
create table public.guest_orders (
  guest_id uuid primary key references public.guests (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  drinks uuid[] not null default '{}',
  dishes uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  role public.staff_role not null,
  name text not null check (char_length(name) between 1 and 60),
  access_code text not null,
  password_hash text not null,
  session_version int not null default 1,
  revoked boolean not null default false,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (event_id, access_code)
);

create table public.staff_sessions (
  token_hash text primary key,
  staff_id uuid not null references public.staff_accounts (id) on delete cascade,
  session_version int not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- une seule entrée par invité : la clé primaire rend la double validation impossible
create table public.entries (
  guest_id uuid primary key references public.guests (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  staff_id uuid references public.staff_accounts (id) on delete set null,
  staff_name text not null,
  persons int not null,
  confirmed_at timestamptz not null default now()
);
create index entries_event_idx on public.entries (event_id);

-- une seule prestation par invité et par type
create table public.services (
  guest_id uuid not null references public.guests (id) on delete cascade,
  kind public.service_kind not null,
  event_id uuid not null references public.events (id) on delete cascade,
  staff_id uuid references public.staff_accounts (id) on delete set null,
  staff_name text not null,
  units int not null,
  served_at timestamptz not null default now(),
  primary key (guest_id, kind)
);
create index services_event_idx on public.services (event_id);

-- journal d'activité propre à un événement (vu par l'organisateur)
create table public.event_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  message text not null check (char_length(message) <= 300)
);
create index event_log_idx on public.event_log (event_id, at desc);
