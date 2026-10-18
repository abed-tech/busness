-- Stockage persistant des photos d'invitation dans PostgreSQL (remplace le compartiment Supabase « event-photos »).
-- 4 photos au maximum par événement (contrainte existante sur events.photos), 6 Mo chacune, JPEG / PNG / WebP.
-- Le chemin garde le format « <id événement>/<uuid>.<ext> » déjà enregistré dans events.photos.

create table if not exists public.event_photo_files (
  path text primary key check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  event_id uuid not null references public.events (id) on delete cascade,
  content bytea not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 6291456),
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = event_id::text)
);
create index if not exists event_photo_files_event_idx on public.event_photo_files (event_id);

alter table public.event_photo_files enable row level security;
-- écriture : seulement par qui peut modifier l'événement ; lecture : servie par le serveur (photos d'invitation publiques)
drop policy if exists event_photo_files_insert on public.event_photo_files;
create policy event_photo_files_insert on public.event_photo_files for insert to authenticated
  with check (private.can_write_event(event_id));
drop policy if exists event_photo_files_delete on public.event_photo_files;
create policy event_photo_files_delete on public.event_photo_files for delete to authenticated
  using (private.can_write_event(event_id));
drop policy if exists event_photo_files_select on public.event_photo_files;
create policy event_photo_files_select on public.event_photo_files for select to authenticated
  using (private.can_write_event(event_id));
revoke all on public.event_photo_files from anon, authenticated;
grant select (path, event_id, content_type, size_bytes, created_at), insert, delete on public.event_photo_files to authenticated;

-- Lecture publique d'une photo par son chemin, uniquement si elle est réellement utilisée par un événement non supprimé.
create or replace function public.photo_file(p_path text)
returns table (content bytea, content_type text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.content, f.content_type, f.created_at
    from public.event_photo_files f join public.events e on e.id = f.event_id
   where f.path = p_path and e.status <> 'deleted' and f.path = any (e.photos)
$$;
revoke execute on function public.photo_file(text) from public;
grant execute on function public.photo_file(text) to anon, authenticated;

-- Suppression des données d'un événement : ses photos partent avec (confidentialité).
create or replace function private.drop_photos_of_deleted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    delete from public.event_photo_files where event_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists events_drop_photos on public.events;
create trigger events_drop_photos after update of status on public.events
  for each row execute function private.drop_photos_of_deleted();
