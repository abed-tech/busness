-- Suppression d'un événement par l'organisateur qui l'a créé (page « Mes événements »).
-- Même stratégie que la suppression par l'administration (private.purge_event) : les données opérationnelles
-- (invités, réponses, entrées, prestations, boissons et plats, personnel, journal) sont effacées, l'événement passe
-- au statut « deleted » (ses photos partent avec, déclencheur events_drop_photos), les transactions et preuves
-- de paiement sont conservées. Les liens d'invitation cessent de fonctionner (invitations_open exige « active »).
-- Droits : propriétaire uniquement, événement et compte actifs (mêmes conditions que toute écriture organisateur).
create or replace function public.delete_my_event(p_event uuid, p_confirm_title text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event and status <> 'deleted';
  if not found then raise exception 'Événement introuvable.' using errcode = 'P0002'; end if;
  if auth.uid() is null or e.owner_id is distinct from auth.uid() or not private.org_access(p_event, true) then
    raise exception 'Suppression refusée : seul l''organisateur qui a créé cet événement peut le supprimer, tant qu''il est actif.' using errcode = '42501';
  end if;
  if trim(coalesce(p_confirm_title, '')) <> trim(e.title) then
    raise exception 'Recopiez exactement le nom de l''événement pour confirmer la suppression.' using errcode = '22023';
  end if;
  perform private.purge_event(p_event);
  perform private.audit('event.delete_owner', 'event', p_event::text, 'success',
    jsonb_build_object('title', e.title, 'transactions_kept', (select count(*) from public.transactions where event_id = p_event)));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.delete_my_event(uuid, text) from public, anon;
grant execute on function public.delete_my_event(uuid, text) to authenticated;
