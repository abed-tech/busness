# API REST v1 — web et futures applications mobiles (React Native + Expo)

Base : `https://<ORGANIZER_ORIGIN>/api/v1`. Réponses JSON, `Cache-Control: no-store`.
Erreurs : `{ "error": { "code": "...", "message": "..." } }`.

## Authentification

```http
POST /api/v1/auth/login        { "email": "...", "password": "..." }
→ 201 { "token": "…", "expires_at": "…", "user": { "id", "email" } }
```
Ensuite : `Authorization: Bearer <token>` (session de 30 jours, révocable par `POST /api/v1/auth/logout`).
Comptes administrateurs refusés ; adresse non confirmée refusée ; trop de tentatives → 429.

Avec Expo, conserver le jeton dans `expo-secure-store` (jamais en clair dans AsyncStorage).

## Points d'entrée

| Méthode | Chemin | Jeton | Description |
|---|---|---|---|
| GET | `/api/health` | non | santé (`?db=1` vérifie la base) |
| GET | `/api/v1` | non | description |
| POST | `/api/v1/auth/login` / `logout` | – / oui | ouvrir / fermer une session |
| GET | `/api/v1/me` | oui | compte et profil |
| GET | `/api/v1/events` | oui | événements visibles (RLS) |
| GET | `/api/v1/events/{id}` | oui | détail |
| GET | `/api/v1/events/{id}/guests` | oui | invités (tables, réponses, jetons d'invitation, codes) |
| POST | `/api/v1/events/{id}/checkout` | oui | `{ "method": "card" \| "mobile_money" }` → 201 `{ reference, amount_cents, currency, payment_url }` |
| POST | `/api/v1/rpc/{fonction}` | selon la fonction | appelle une fonction autorisée de la base ; corps = arguments `p_…` → `{ "data": … }` |

Fonctions autorisées par `/rpc` (chacune revérifie les droits dans la base) :

| Espace | Fonctions |
|---|---|
| Organisateur (jeton) | `event_billing`, `event_stats`, `service_totals`, `save_table_plan`, `create_staff`, `set_staff_revoked`, `reset_staff_password`, `delete_staff`, `mark_invitations_sent`, `rotate_service_key` |
| Invité (sans jeton) | `get_invitation(p_token)`, `submit_rsvp(p_token, p_answer, p_drinks, p_dishes)` |
| Contrôleur / serveur (sans jeton organisateur) | `staff_login`, `staff_lookup(p_token, p_scan)`, `staff_confirm_entry(p_token, p_guest)`, `staff_mark_served`, `staff_overview`, `staff_logout` |
| Public | `public_pricing`, `service_board` |

Aucune fonction d'administration n'est exposée.

Codes : 400 requête invalide · 401 jeton absent ou expiré · 403 refusé par la base · 404 inconnu ou domaine non autorisé ·
409 rien à régler / doublon · 429 trop de tentatives · 502 prestataire indisponible · 503 base ou moyen de paiement indisponible.

## QR code d'accès et entrées

Contenu du QR : `CRM2:<invite_token>`. Le contrôleur le transmet tel quel à `staff_lookup` (refus d'un QR inconnu ou d'un
autre événement ; `valid` vaut `true` seulement pour un invité confirmé pas encore entré). `staff_confirm_entry` est
idempotente : une seule entrée par invité, même avec 20 validations simultanées (`db/tests/20_concurrency.sh`).

## Paiement depuis le mobile

Le montant n'est jamais fourni par le client : il est calculé par la base. Ouvrir `payment_url` dans le navigateur ;
le paiement n'est confirmé que par le webhook signé du prestataire. Ensuite, interroger `event_billing` (`can_send`).
Limite connue : la page de retour est une page web de l'espace organisateur (un lien profond pourra être ajouté).
