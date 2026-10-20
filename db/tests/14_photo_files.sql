-- Tests : stockage des photos dans PostgreSQL (remplace le stockage Supabase). S'exécute après 10 à 13.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');
insert into public.events (owner_id, title, event_date, venue, address, table_capacity, offer, expected)
values ('00000000-0000-0000-0000-0000000000a1', 'Photos Base', current_date + 40, 'Salle P', 'Rue P', 6, 'none', 1);
insert into public.t_vars select 'ph', id::text from public.events where title = 'Photos Base';

do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'ph'); p text; begin
  p := e::text || '/11111111-1111-4111-8111-111111111111.jpg';
  insert into public.event_photo_files (path, event_id, content, content_type, size_bytes) values (p, e, '\xffd8ffe0'::bytea, 'image/jpeg', 4);
  update public.events set photos = array[p] where id = e;
  perform t_ok('le propriétaire enregistre une photo');
  begin
    insert into public.event_photo_files (path, event_id, content, content_type, size_bytes)
    values (e::text || '/22222222-2222-4222-8222-222222222222.gif', e, '\x47494638'::bytea, 'image/gif', 4); raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('format non autorisé refusé (JPEG, PNG, WebP seulement)'); end;
  begin
    insert into public.event_photo_files (path, event_id, content, content_type, size_bytes)
    values (gen_random_uuid()::text || '/33333333-3333-4333-8333-333333333333.jpg', e, '\xffd8'::bytea, 'image/jpeg', 2); raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('chemin d''un autre événement refusé'); end;
end $$;

-- un autre organisateur ne peut ni écrire, ni lire, ni supprimer
select t_claims('00000000-0000-0000-0000-0000000000a2');
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'ph'); n int; begin
  begin
    insert into public.event_photo_files (path, event_id, content, content_type, size_bytes)
    values (e::text || '/44444444-4444-4444-8444-444444444444.png', e, '\x89504e47'::bytea, 'image/png', 4); raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.event_photo_files where event_id = e; assert n = 0, 'photo visible par un autre organisateur';
  delete from public.event_photo_files where event_id = e; get diagnostics n = row_count; assert n = 0, 'photo supprimée par un autre organisateur';
  begin perform content from public.event_photo_files limit 1; raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('un autre organisateur ne voit, n''ajoute ni ne supprime aucune photo');
end $$;

-- lecture publique : uniquement une photo réellement utilisée par l'événement
set role anon; select set_config('request.jwt.claims', '{}', false);
do $$ declare e uuid := (select v::uuid from public.t_vars where k = 'ph'); begin
  assert (select content_type from public.photo_file(e::text || '/11111111-1111-4111-8111-111111111111.jpg')) = 'image/jpeg';
  assert not exists (select 1 from public.photo_file(e::text || '/99999999-9999-4999-8999-999999999999.jpg'));
  begin perform 1 from public.event_photo_files limit 1; raise exception 'ÉCHEC';
  exception when insufficient_privilege then null; end;
  perform t_ok('photo d''invitation lisible publiquement par son chemin, table inaccessible');
end $$;

-- suppression des données de l'événement : les photos partent avec
reset role;
update public.events set status = 'deleted' where title = 'Photos Base';
do $$ begin
  assert not exists (select 1 from public.event_photo_files where event_id = (select v::uuid from public.t_vars where k = 'ph'));
  perform t_ok('événement supprimé : photos effacées');
end $$;
reset role;
do $$ begin raise notice 'Tests du stockage des photos passés.'; end $$;
