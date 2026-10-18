# Architecture technique — Cérémonia (tout sur Render)

## 1. Vue d'ensemble

```
                         ┌──────────────────────────── Render (région Frankfurt) ────────────────────────────┐
 Organisateurs ─HTTPS──▶ │ ceremonia-app  (apps/web — Next.js 15, React 19, TypeScript, Node 22)               │
 Invités (/i/…)          │   pages + actions serveur · API REST /api/v1 · webhooks /api/webhooks/* ·           │
 Contrôleurs (/k/…)      │   photos /media/event-photos/* · santé /api/health · tâches planifiées (horaires)   │
 Page Service (/s/…)     │                                                                                     │
 Apps mobiles (Expo) ──▶ │                     │ réseau privé Render (URL interne, sans Internet)              │
                         │                     ▼                                                               │
 Super admin ─HTTPS────▶ │ cer-console-…  (apps/admin — Next.js) ──▶  ceremonia-db (PostgreSQL 16)            │
                         │   domaine distinct, second facteur        données · comptes · sessions · photos     │
                         │   obligatoire                             règles RLS · fonctions · journal immuable │
                         └─────────────────────────────────────────────────────────────────────────────────────┘
                                              ▲ webhooks signés                 │ création des paiements
                                         Stripe / CinetPay ◀────────────────────┘
                                         Resend (e-mails, facultatif)
```

**Principe conservé** : toute la sécurité métier est dans PostgreSQL. Chaque requête d'un utilisateur s'exécute dans
une transaction qui bascule sur un rôle d'accès (`anon`, `authenticated` ou `service_role`) et pose son identité
(`request.jwt.claims`) : les règles RLS, les droits par colonne et les fonctions `SECURITY DEFINER` décident, exactement
comme avant. Les applications Next.js n'ont aucun droit propre sur les données.

## 2. Ce qui a changé en quittant Supabase

| Fonction | Avant (Supabase) | Maintenant (Render) | Où |
|---|---|---|---|
| Base | PostgreSQL Supabase | **PostgreSQL 16 Render** (base payante : la gratuite expire après 30 jours) | `render.yaml` |
| Migrations | `supabase db push` | **appliquées au démarrage** par `migrate.mjs` (ordre, une transaction par fichier, verrou, empreinte : un fichier déjà appliqué ne peut plus être modifié) | `db/migrations`, `packages/server/scripts/migrate.mjs` |
| Rôles et identité | fournis par Supabase | migration `20261013000000_platform.sql` : rôles, `auth.uid()`, `auth.jwt()` | `db/migrations` |
| Accès aux données | client `supabase-js` (API PostgREST) | **`@ceremonia/server`** : même interface (`from/select/eq/insert/update/delete/rpc`), traduite en SQL paramétré dans une transaction au nom de l'utilisateur | `packages/server/src/data.ts` |
| Comptes, sessions | Supabase Auth | mots de passe **bcrypt calculés par PostgreSQL** ; session = jeton aléatoire 256 bits en cookie httpOnly, seule son empreinte SHA-256 est en base ; limitation des tentatives | `packages/server/src/auth.ts` |
| Second facteur admin | TOTP Supabase | **TOTP (RFC 6238)**, rejeu d'un code refusé, niveau `aal2` porté par la session | `packages/server/src/totp.ts` |
| E-mails | Supabase | **Resend** (facultatif) ; en local, liens affichés dans le terminal | `packages/server/src/mail.ts` |
| Photos | Supabase Storage | **table PostgreSQL** `event_photo_files` (persistante, sauvegardée avec la base ; écriture soumise à RLS ; servie seulement si utilisée par un événement actif ; effacée avec l'événement) | migration 900, `/media/event-photos` |
| Webhooks paiement | Edge Functions Deno | **routes Next.js** `/api/webhooks/stripe` et `/cinetpay` (même code de vérification, même fonction `apply_payment_event` idempotente) | `apps/web/app/api/webhooks` |
| Tâches planifiées | pg_cron | **planificateur interne** de ceremonia-app (démarrage puis toutes les heures, verrou PostgreSQL, tâches rejouables) | `packages/server/src/jobs.ts`, `apps/web/instrumentation.ts` |
| API mobile | API REST Supabase | **`/api/v1`** : connexion par jeton, événements, invités, paiement, appel des fonctions autorisées de la base | `docs/API.md` |

Inchangé : les 8 migrations métier existantes (tables, RLS, fonctions, journal), les écrans, les règles métier,
`packages/core`, le contrôle de domaine (404 sur un autre domaine), les en-têtes de sécurité.

## 3. Choix techniques (architecture cible)

| Cible | Décision | Justification |
|---|---|---|
| Next.js / React / TypeScript | conservé | identique à la cible |
| Backend Node.js + TypeScript (NestJS si nécessaire) | **Node.js + TypeScript dans Next.js** (actions serveur, routes) + paquet `@ceremonia/server` | NestJS dupliquerait des règles déjà vérifiées par la base et ajouterait un 3ᵉ service ; non nécessaire |
| PostgreSQL | Render PostgreSQL 16 | demandé |
| Prisma ou ORM existant | **pas de Prisma** : SQL versionné + couche `@ceremonia/server` (pilote `pg`) | Prisma se connecte en propriétaire, ce qui **contourne RLS**, et ne gère ni politiques, ni fonctions, ni déclencheurs : la sécurité serait affaiblie |
| API REST sécurisée | `/api/v1` (jeton Bearer, revérification par la base) | utilisable par Expo sans reconstruire le backend |
| Stockage persistant | PostgreSQL (photos ≤ 4 × 6 Mo par événement) | aucun disque éphémère ; un seul service à sauvegarder. Si le volume grandit beaucoup, passer à un stockage objet (S3 / R2) |
| Services Render | 1 base + 2 services web | aucun worker : tâches dans ceremonia-app, webhooks dans ceremonia-app |

## 4. Les quatre espaces

| Espace | Où | Authentification | Vérifications côté base |
|---|---|---|---|
| Organisateur | ceremonia-app (`/events…`) | e-mail + mot de passe, cookie `cer-org` (httpOnly, 30 jours) | RLS par propriétaire, compte suspendu = lecture seule, paiement puis photo obligatoires avant envoi |
| Invité | ceremonia-app `/i/<jeton>` | jeton d'invitation aléatoire | `get_invitation`, `submit_rsvp` : fermée tant que non réglée, réponse figée après l'entrée |
| Contrôleur / serveur | ceremonia-app `/k/<événement>/<accès>` | code + mot de passe bcrypt, jeton de session, blocage après 5 essais | une seule entrée par invité (clé primaire), QR inconnu ou d'un autre événement refusé |
| Super administrateur | cer-console-… (domaine distinct) | mot de passe + **TOTP obligatoire**, cookie `cer-adm` (SameSite=Strict), 30 min d'inactivité, 12 h maximum | `private.has_perm` (admin actif + aal2), rôles super / modérateur / gestionnaire, journal immuable |

Un compte organisateur ne peut jamais devenir administrateur, et inversement (tests SQL et test de parcours).

## 5. Communications et sécurité

- Navigateur ↔ Next.js : HTTPS (certificat Render), cookies httpOnly + Secure, CSP stricte (`connect-src 'self'`), HSTS, `X-Frame-Options: DENY`.
- Next.js ↔ PostgreSQL : réseau privé Render (URL interne) ; base fermée à Internet (`ipAllowList: []`).
- Mobile ↔ `/api/v1` : HTTPS + jeton Bearer. Pas de CORS (inutile pour une application native ; aucun site tiers autorisé).
- Prestataires → webhooks : signature vérifiée, statut relu chez CinetPay, notifications rejouées ignorées.
- Contrôle de domaine : chaque application répond 404 hors de son domaine ; exemptés : `/api/health` (aucune donnée), et sur
  ceremonia-app les routes `/api/*` qui appliquent leur propre contrôle (API v1) ou leur signature (webhooks).
