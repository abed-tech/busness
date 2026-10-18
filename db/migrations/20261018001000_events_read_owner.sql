-- Création d'un événement avec retour de son identifiant (INSERT … RETURNING) :
-- PostgreSQL applique la règle de lecture à la ligne renvoyée, et private.can_read_event(id) relit la table,
-- où la ligne en cours d'insertion n'est pas encore visible. Le propriétaire est donc reconnu directement sur la ligne.
-- Aucun droit nouveau : le propriétaire pouvait déjà lire ses événements.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (owner_id = auth.uid() or private.can_read_event(id));
