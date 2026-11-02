-- Navigation de l'organisateur : dernière page consultée, gardée avec la session (côté serveur).
-- Sert à rouvrir cette page quand l'organisateur revient moins de 10 minutes après sa dernière activité
-- (navigateur fermé puis rouvert). Colonne ajoutée, vide pour les sessions existantes : aucune donnée modifiée.
alter table auth.sessions add column if not exists last_path text
  check (last_path is null or (char_length(last_path) <= 500 and last_path like '/%' and last_path not like '//%'));
