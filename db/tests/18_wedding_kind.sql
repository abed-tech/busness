-- Tests : type de mariage (events.wedding_kind). S'exécute après 10 à 17.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role; set role authenticated; select t_claims('00000000-0000-0000-0000-0000000000a1');

do $$ declare k text; begin
  -- l'organisateur enregistre chaque type de mariage proposé
  foreach k in array array['civil', 'coutumier', 'religieux', 'civil_coutumier', 'civil_religieux', 'coutumier_religieux', 'civil_coutumier_religieux'] loop
    insert into public.events (owner_id, type, wedding_kind, title, event_date, venue, address, table_capacity, offer, expected)
    values ('00000000-0000-0000-0000-0000000000a1', 'mariage', k, 'Mariage ' || k, current_date + 40, 'S', 'A', 8, 'none', 1);
    assert (select wedding_kind = k from public.events where title = 'Mariage ' || k), k;
  end loop;
  perform t_ok('les sept types de mariage sont enregistrés');

  -- un mariage déjà enregistré sans type reste valide (aucune valeur inventée)
  insert into public.events (owner_id, type, title, event_date, venue, address, table_capacity, offer, expected)
  values ('00000000-0000-0000-0000-0000000000a1', 'mariage', 'Mariage sans type', current_date + 40, 'S', 'A', 8, 'none', 1);
  assert (select wedding_kind = '' from public.events where title = 'Mariage sans type');
  perform t_ok('mariage sans type : valeur vide par défaut');

  -- valeur inconnue refusée
  begin
    insert into public.events (owner_id, type, wedding_kind, title, event_date, venue, address, table_capacity, offer, expected)
    values ('00000000-0000-0000-0000-0000000000a1', 'mariage', 'autre', 'Mariage autre', current_date + 40, 'S', 'A', 8, 'none', 1);
    raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('type de mariage inconnu refusé'); end;

  -- jamais de type de mariage sur un autre type d'événement
  begin
    insert into public.events (owner_id, type, wedding_kind, title, event_date, venue, address, table_capacity, offer, expected)
    values ('00000000-0000-0000-0000-0000000000a1', 'anniversaire', 'civil', 'Anniv civil', current_date + 40, 'S', 'A', 8, 'none', 1);
    raise exception 'ÉCHEC';
  exception when check_violation then perform t_ok('type de mariage refusé hors mariage'); end;

  -- modification par l'organisateur
  update public.events set wedding_kind = 'religieux' where title = 'Mariage sans type';
  assert (select wedding_kind = 'religieux' from public.events where title = 'Mariage sans type');
  perform t_ok('type de mariage modifiable par l''organisateur');
end $$;
