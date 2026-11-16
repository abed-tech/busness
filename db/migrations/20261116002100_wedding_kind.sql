-- =====================================================================
-- Type de mariage (civil, coutumier, religieux et leurs combinaisons), repris dans le message WhatsApp des invitations.
-- Colonne facultative pour la base : vide ('') pour les autres types d'événement et pour les mariages déjà enregistrés
-- (aucune valeur n'est inventée) ; l'application l'exige à la saisie d'un mariage.
-- Aucune donnée existante n'est modifiée ni supprimée.
-- =====================================================================
alter table public.events add column if not exists wedding_kind text not null default '';

alter table public.events drop constraint if exists events_wedding_kind_check;
alter table public.events add constraint events_wedding_kind_check check (
  wedding_kind in ('', 'civil', 'coutumier', 'religieux', 'civil_coutumier', 'civil_religieux', 'coutumier_religieux', 'civil_coutumier_religieux')
  and (wedding_kind = '' or type = 'mariage')
);

grant insert (wedding_kind) on public.events to authenticated;
grant update (wedding_kind) on public.events to authenticated;
