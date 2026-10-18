-- Au moins une photo par invitation : elle sert de fond à l'invitation.
-- 1) L'envoi des invitations est refusé tant que l'événement n'a aucune photo.
-- 2) Une fois une photo ajoutée, on ne peut plus revenir à zéro (remplacer = ajouter puis retirer).
-- Les événements existants sans photo restent lisibles et modifiables ; seul l'envoi est bloqué.

create or replace function public.mark_invitations_sent(p_event uuid, p_guests uuid[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b jsonb; n int;
begin
  if not private.can_write_event(p_event) then raise exception 'Accès refusé.' using errcode = '42501'; end if;
  b := public.event_billing(p_event);
  if not (b ->> 'can_send')::boolean then
    raise exception 'Réglez d''abord le montant restant pour envoyer les invitations.' using errcode = '42501';
  end if;
  if coalesce((select array_length(photos, 1) from public.events where id = p_event), 0) = 0 then
    raise exception 'Ajoutez au moins une photo pour l''invitation avant l''envoi.' using errcode = '23514';
  end if;
  update public.guests set whatsapp_opened_at = now() where event_id = p_event and id = any(p_guests);
  get diagnostics n = row_count;
  if n > 0 then perform private.event_log(p_event, private.actor_label(), n || ' invitation(s) envoyée(s) sur WhatsApp'); end if;
  return jsonb_build_object('ok', true, 'marked', n);
end $$;

create or replace function private.keep_one_photo() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(array_length(old.photos, 1), 0) > 0 and coalesce(array_length(new.photos, 1), 0) = 0 and new.status <> 'deleted' then
    raise exception 'Gardez au moins une photo : ajoutez d''abord la nouvelle, puis retirez celle-ci.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists events_keep_one_photo on public.events;
create trigger events_keep_one_photo before update of photos on public.events
  for each row execute function private.keep_one_photo();
