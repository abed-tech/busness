# Déploiement sur Render (depuis GitHub) — tout sur Render

Render héberge : la base **PostgreSQL** `ceremonia-db`, le service **ceremonia-app** (organisateurs, invités, personnel,
API, webhooks) et le service **admin** (domaine distinct). Voir `docs/ARCHITECTURE.md`.

## 0. Avant de commencer

- Dépôt GitHub **privé**. Aucun secret dans le code : tout se saisit dans Render.
- **Coût** : la base gratuite de Render expire après 30 jours (puis est supprimée) → prendre la plus petite base payante.
  Les services gratuits s'endorment après 15 minutes (réveil d'environ une minute) → « Starter » recommandé, au moins pour
  ceremonia-app avant un vrai événement. `render.yaml` est réglé ainsi ; vous pouvez choisir autre chose dans Render.
- La commande `pnpm db:seed` (démonstration) refuse toute base qui n'est pas locale. Rien de fictif n'est envoyé en ligne.

## 1. Création (Blueprint)

1. Poussez le code sur GitHub (branche `main`).
2. Render → **New → Blueprint** → choisissez le dépôt. Render lit `render.yaml` et propose :
   la base `ceremonia-db`, le service `ceremonia-app`, le service `cer-console-tmj4sb22` (renommable).
3. Render demande les variables marquées `sync: false` (tableau ci-dessous). Les URLs ne sont pas encore connues :
   mettez une valeur provisoire différente pour chacune (ex. `https://a.example` et `https://b.example`).
4. Une fois créés, copiez l'**URL réelle** de chaque service (en haut de sa page, ex. `https://ceremonia-app.onrender.com`)
   et corrigez `ORGANIZER_ORIGIN` et `ADMIN_ORIGIN` **dans les deux services**, à l'identique : `https://`, sans `/` final.
   Enregistrez : Render redéploie.

Au démarrage, chaque service applique les migrations manquantes (verrou partagé : jamais deux fois en même temps),
puis lance l'application. Aucune commande de base n'est à taper.

### Commandes exactes (déjà dans render.yaml)

| | ceremonia-app | admin |
|---|---|---|
| Runtime | Node 22 | Node 22 |
| Build Command | `bash scripts/render-build.sh web` | `bash scripts/render-build.sh admin` |
| Start Command | `bash scripts/render-start.sh web` | `bash scripts/render-start.sh admin` |
| Health Check Path | `/api/health` | `/api/health` |
| Root Directory | (vide) | (vide) |

- `render-build.sh` : pnpm 9.12.0 (corepack, sinon npx), installation du monorepo, `next build`.
- `render-start.sh` : vérifie les variables, `node packages/server/scripts/migrate.mjs db/migrations`, puis `next start` sur `0.0.0.0:$PORT`.

### Variables d'environnement

| Variable | ceremonia-app | admin | Secret | Valeur |
|---|---|---|---|---|
| `DATABASE_URL` | ✔ | ✔ | oui | **reliée automatiquement** à `ceremonia-db` (URL interne) |
| `ORGANIZER_ORIGIN` | ✔ | ✔ | non | URL de ceremonia-app |
| `ADMIN_ORIGIN` | ✔ | ✔ | non | URL du service admin (domaine différent) |
| `RESEND_API_KEY`, `MAIL_FROM` | facultatif | ✘ | oui / non | e-mails (confirmation d'inscription, mot de passe oublié) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | facultatif | ✘ | oui | carte bancaire |
| `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY` | facultatif | ✘ | oui | mobile money |
| `ADMIN_IDLE_MINUTES` | ✘ | ✔ (30) | non | déjà dans render.yaml |
| `DISABLE_SCHEDULER` | ✘ | ✔ (1) | non | les tâches planifiées tournent dans ceremonia-app |
| `NODE_VERSION` (22), `NEXT_TELEMETRY_DISABLED` (1) | ✔ | ✔ | non | déjà dans render.yaml |

Sans `RESEND_API_KEY` : les comptes organisateurs sont ouverts sans vérifier l'adresse, et « mot de passe oublié »
affiche qu'il n'est pas encore disponible. Ne définissez jamais `DEV_PAYMENTS` en ligne (ignorée de toute façon).

## 2. Premier administrateur (une seule fois)

La base est fermée à Internet. Le temps de cette opération :
1. Render → `ceremonia-db` → **Access Control** : ajoutez votre adresse IP.
2. Copiez l'**External Database URL** (Render → `ceremonia-db` → Connect). Ne la partagez avec personne.
3. Sur votre PC, dans le dossier du projet (après `pnpm install`) :
   ```bash
   DATABASE_URL="<External Database URL>" DATABASE_SSL=no-verify pnpm admin:create admin@votre-domaine "Votre nom"
   ```
   (PowerShell : `$env:DATABASE_URL="…"; $env:DATABASE_SSL="no-verify"; pnpm admin:create admin@votre-domaine "Votre nom"`)
   Le mot de passe (12 caractères minimum) est demandé sans s'afficher.
4. Retirez votre adresse IP de l'Access Control.
5. Ouvrez `https://<admin>/login` : connexion, puis activation du second facteur (QR code à scanner).

Autres administrateurs : même commande avec `--role moderator` ou `--role manager`, ou nomination d'un compte existant
depuis **Paramètres → Administrateurs**. Une adresse déjà utilisée par un organisateur est toujours refusée.

## 3. Vérifications après déploiement

1. `https://<ceremonia-app>/api/health?db=1` → `{"status":"ok", … "db":"ok"}` ; idem sur l'admin.
2. `https://<ceremonia-app>/signup` → créer un compte organisateur, puis un événement (8 écrans) avec une photo.
3. `https://<admin>/login` → connexion + second facteur, tableau de bord.
4. Une page « Not found » en texte brut = l'URL ne correspond pas exactement à `ORGANIZER_ORIGIN` / `ADMIN_ORIGIN`.
5. Logs de démarrage : « Base à jour » ou « N migration(s) appliquée(s) ».

## 4. Paiements (quand les comptes existent)

- **Stripe** : Developers → Webhooks → point de terminaison `https://<ceremonia-app>/api/webhooks/stripe`, événements
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
  `checkout.session.expired`, `charge.refunded`. Copiez le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`, la clé `sk_…`
  dans `STRIPE_SECRET_KEY`.
- **CinetPay** : `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY` ; l'URL de notification
  (`https://<ceremonia-app>/api/webhooks/cinetpay`) est envoyée automatiquement à chaque paiement.
- Faites un paiement test en mode sandbox avant l'ouverture : ces webhooks n'ont jamais été testés contre les vrais prestataires.

## 5. Mises à jour et sauvegardes

- Chaque `git push` sur `main` redéploie le service concerné. Une nouvelle migration s'applique toute seule au démarrage.
- Ne modifiez jamais une migration déjà appliquée (le démarrage s'arrêterait) : ajoutez-en une nouvelle.
- Sauvegardes : les bases payantes Render ont des sauvegardes automatiques (photos comprises, puisqu'elles sont dans la base).

## 6. Si le premier démarrage échoue sur « droit CREATEROLE requis »

La migration `20261013000000_platform.sql` crée trois rôles PostgreSQL (`anon`, `authenticated`, `service_role`) qui portent
les règles d'accès. Si le compte de la base Render n'a pas le droit de créer des rôles, contactez le support Render
(ou envoyez-moi le message d'erreur exact) : c'est le seul prérequis qui n'a pas pu être vérifié avant le premier déploiement.

## 7. Tests (sur votre ordinateur)

```bash
pnpm test                 # logique commune + signatures des webhooks
pnpm typecheck            # TypeScript des quatre paquets
pnpm build                # compilation Next.js des deux applications
pnpm test:db              # PostgreSQL local : sécurité, QR, doublons, concurrence, photos (Linux / macOS / WSL)
DATABASE_URL=<base de test locale migrée> pnpm test:server        # comptes, sessions, TOTP, accès aux données, photos
DATABASE_URL=<base de test locale migrée> pnpm test:integration   # parcours complet organisateur → invité → contrôleur → admin
```
Recommandé : committer le `pnpm-lock.yaml` produit par `pnpm install` (build Render en mode figé).
