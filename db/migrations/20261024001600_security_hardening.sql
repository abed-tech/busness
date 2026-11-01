-- =====================================================================
-- Durcissement issu de l'audit de sécurité (octobre 2026).
-- 1) Insertion d'invités et de listes : seules les colonnes saisies par l'organisateur sont autorisées.
--    Avant : toutes les colonnes (jeton d'invitation, code, réponse, date d'envoi… choisis par le client).
-- 2) Photos : 8 fichiers au plus par événement (4 affichées + remplacements en cours), contre un remplissage
--    de la base par des envois répétés ou simultanés.
-- =====================================================================

-- ---------- 1) colonnes autorisées à l'insertion ----------
revoke insert on public.guests from authenticated;
grant insert (event_id, name, kind, whatsapp, table_no, placed_manually) on public.guests to authenticated;

revoke insert on public.catalog_items from authenticated;
grant insert (event_id, kind, name) on public.catalog_items to authenticated;

-- ---------- 2) nombre de fichiers photo par événement ----------
create or replace function private.photo_files_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- verrou de l'événement : deux envois simultanés ne dépassent pas la limite
  perform 1 from public.events where id = new.event_id for update;
  if (select count(*) from public.event_photo_files where event_id = new.event_id) >= 8 then
    raise exception 'Trop de photos enregistrées pour cet événement : retirez-en avant d''en ajouter.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists event_photo_files_limit on public.event_photo_files;
create trigger event_photo_files_limit before insert on public.event_photo_files
  for each row execute function private.photo_files_limit();

revoke execute on function private.photo_files_limit() from public, anon, authenticated;
