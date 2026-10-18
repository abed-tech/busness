-- =====================================================================
-- Finances, journal d'activité inaltérable, rapports mensuels, sécurité
-- =====================================================================

create type public.tx_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.tx_method as enum ('mobile_money', 'card');

-- Les transactions ne dépendent pas de l'existence de l'événement :
-- event_id passe à NULL si l'événement disparaît, et event_snapshot garde la preuve.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('CRM-' || upper(private.short_id(10))),
  event_id uuid references public.events (id) on delete set null,
  organizer_id uuid references public.profiles (id) on delete set null,
  event_snapshot jsonb not null,
  persons int not null check (persons >= 0),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  method public.tx_method not null,
  provider text not null check (provider in ('stripe', 'cinetpay')),
  provider_ref text,
  status public.tx_status not null default 'pending',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  unique (provider, provider_ref)
);
create index transactions_status_idx on public.transactions (status, created_at desc);
create index transactions_confirmed_idx on public.transactions (confirmed_at) where status = 'succeeded';

-- Preuves brutes reçues des prestataires (webhooks), conservées même si l'événement est supprimé.
create table public.payment_events (
  id bigint generated always as identity primary key,
  transaction_id uuid references public.transactions (id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  status public.tx_status not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

-- Rapports mensuels figés à la clôture du mois (les archives ne sont jamais effacées).
create table public.monthly_reports (
  month date primary key check (extract(day from month) = 1),
  revenue_cents bigint not null,
  currency text not null,
  tx_succeeded int not null,
  tx_pending int not null,
  tx_failed int not null,
  tx_refunded int not null,
  refunded_cents bigint not null,
  events_created int not null,
  events_free_admin int not null,
  organizers_new int not null,
  closed_at timestamptz not null default now()
);

-- ---------- journal d'activité ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_label text not null,
  actor_role text not null,
  action text not null,
  object_type text not null,
  object_id text,
  result text not null check (result in ('success', 'denied', 'error')),
  details jsonb not null default '{}'::jsonb
);
create index audit_at_idx on public.audit_log (at desc);
create index audit_action_idx on public.audit_log (action, at desc);

create or replace function private.audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Le journal d''activité ne peut pas être modifié ni supprimé.' using errcode = '42501';
end $$;
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function private.audit_immutable();
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_immutable();
create trigger payment_events_no_update before update or delete on public.payment_events
  for each row execute function private.audit_immutable();

-- ---------- tentatives de connexion à l'espace admin ----------
create table public.admin_login_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip text not null default '',
  success boolean not null,
  at timestamptz not null default now()
);
create index admin_login_idx on public.admin_login_attempts (email_hash, at desc);
create index admin_login_ip_idx on public.admin_login_attempts (ip, at desc);
