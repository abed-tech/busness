-- Nouvelles valeurs d'énumération pour le parcours « aperçu → paiement simulé → création ».
-- Fichier séparé : PostgreSQL n'autorise l'usage d'une nouvelle valeur qu'après la validation de la transaction qui l'ajoute.
-- - event_status 'draft' : événement d'organisateur en cours de création, pas encore payé (jamais actif).
-- - tx_method 'simulation' : paiement simulé (aucun prestataire, aucun argent réel).
-- - tx_status 'cancelled' : paiement annulé par l'organisateur (distinct d'un échec).
alter type public.event_status add value if not exists 'draft';
alter type public.tx_method add value if not exists 'simulation';
alter type public.tx_status add value if not exists 'cancelled';
