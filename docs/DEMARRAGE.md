# Démarrer Cérémonia sur votre ordinateur

Ce guide lance **toute la plateforme en local** : la base de données PostgreSQL (Docker), l’espace organisateur
(avec les invitations, les contrôleurs et les serveurs) et l’espace administrateur.

## 1. À installer une seule fois

| Outil | Pourquoi | Lien |
|---|---|---|
| **Node.js 20 ou plus récent** (22 conseillé) | exécute les applications | https://nodejs.org |
| **Docker Desktop** | fait tourner PostgreSQL 16 sur votre machine (comme sur Render) | https://www.docker.com/products/docker-desktop |
| **VS Code** | éditeur | https://code.visualstudio.com |

Ensuite, dans un terminal ouvert en administrateur : `corepack enable` (active **pnpm**, fourni avec Node).

## 2. Lancer la plateforme

Ouvrez le dossier `ceremonia-prod` dans VS Code, puis le terminal intégré (menu **Terminal → Nouveau terminal**),
Docker Desktop ouvert :

```bash
pnpm install          # installe les dépendances (2 à 5 min la première fois)
pnpm setup:env        # crée les fichiers .env.local des deux applications (base locale)
pnpm db:start         # démarre PostgreSQL (Docker), applique les migrations, charge la démonstration
pnpm dev              # lance l’espace organisateur et l’espace admin
```

`pnpm db:start` applique les migrations de `db/migrations` et charge les **données de démonstration**
(`db/seed.sql`, refusé sur toute base qui n’est pas locale).

| Adresse | Contenu |
|---|---|
| http://localhost:3000 | Espace organisateur, invitations (`/i/…`), personnel (`/k/…`), page Service (`/s/…`) |
| http://127.0.0.1:3100 | Espace administrateur |
| `localhost:5433` | PostgreSQL local (utilisateur `ceremonia`, mot de passe `ceremonia-local`) |

E-mails en local : les liens (confirmation d’inscription, mot de passe oublié) s’affichent **dans le terminal** de `pnpm dev`.

> Les deux espaces utilisent volontairement deux adresses différentes (`localhost` et `127.0.0.1`) :
> comme en production avec deux domaines, leurs sessions ne se mélangent jamais.

Dans VS Code, vous pouvez aussi utiliser **Terminal → Exécuter la tâche** (tâches 1, 2, 3) ou l’onglet
**Exécuter et déboguer** → « Les deux applications ».

## 3. Comptes de démonstration (local uniquement)

| Rôle | Où | Identifiants |
|---|---|---|
| Organisateur | http://localhost:3000/login | `organisateur@demo.local` / `Demo-Organisateur-1` |
| Administrateur principal | http://127.0.0.1:3100/login | `admin@demo.local` / `Demo-Admin-1` — à la première connexion, scannez le QR code avec une application d’authentification (Google Authenticator, Microsoft Authenticator, 1Password…) |
| Contrôleur | http://localhost:3000/k/DEMO2026/44444444-4444-4444-8444-444444444441 | code `CTL234` / mot de passe `controle1` |
| Serveur | http://localhost:3000/k/DEMO2026/44444444-4444-4444-8444-444444444442 | code `SRV234` / mot de passe `service1` |
| Personnel de service (lien) | http://localhost:3000/s/DEMO2026/demoservice | aucun identifiant |

Vous pouvez aussi créer votre propre compte organisateur depuis http://localhost:3000/signup.

## 4. Parcours de test complet

1. **Organisateur** : connectez-vous, ouvrez « Patrick & Grâce ».
2. **Invités** : ajoutez un invité, collez une liste, importez un fichier Excel ou CSV (colonnes Nom ; Statut ; WhatsApp).
3. **Tables** : « Placer les invités » (les couples restent ensemble, aucune table n’est dépassée), déplacez ou échangez des invités.
4. **Boissons / Buffet** : ajoutez, renommez, supprimez des éléments.
5. **Photos** (« Modifier l’événement ») : ajoutez 1 à 4 photos — au moins une est obligatoire pour envoyer les invitations (JPEG, PNG, WebP ; les grandes photos sont réduites automatiquement).
6. **Aperçu de l’invitation** depuis l’accueil de l’événement.
7. **Règlement** : sur l’accueil, cliquez « Payer… ». En local, aucun prestataire n’est appelé : la page affiche une référence
   `CRM-…`. Confirmez-la comme le ferait le prestataire :
   ```bash
   pnpm dev:confirm-payment CRM-XXXXXXXXXX
   ```
   La page se met à jour, l’envoi des invitations est activé.
8. **Envoi** : rubrique « Envoi des invitations » → WhatsApp s’ouvre avec le message et le lien personnel.
9. **Invité** : ouvrez http://localhost:3000/i/demo-invitation-mbuyi-01 (ou le lien d’un autre invité), confirmez la présence et
   choisissez une boisson et un plat par personne. Le QR code d’accès apparaît.
   *(Avant l’étape 7, ce lien affiche « Invitation indisponible » : c’est voulu.)*
10. **Contrôleur** : ouvrez son lien, connectez-vous, scannez le QR code avec la caméra, prenez-le en photo,
    ou saisissez le code `MBUYI1`. « Confirmer l’entrée ». Un second scan affiche « Déjà validée ».
11. **Serveur** : même principe, puis « Boisson servie » / « Plat servi ».
12. **Suivis** : « Suivi de présence », « Suivi boissons », « Suivi plats », « Service » se mettent à jour tout seuls.
13. **Administrateur** : tableau de bord, événements (création gratuite, pour la plateforme ou pour un organisateur),
    organisateurs (suspendre / réactiver), finances (le paiement de l’étape 7 apparaît), rapports, journal, paramètres.

### Scanner avec un téléphone

La caméra du navigateur n’est autorisée que sur `https` ou sur `localhost`. Pour tester avec un vrai téléphone, utilisez
« Prendre une photo du QR code » ou la saisie du code, ou exposez votre poste en https (par exemple avec
`cloudflared tunnel --url http://localhost:3000`).

## 5. Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm db:reset` | vide la base locale et la recrée (migrations + démonstration) |
| `pnpm db:down` | arrête PostgreSQL local (les données restent) |
| `pnpm db:migrate` | applique les nouvelles migrations |
| `pnpm test` | tests de la logique métier et des signatures de paiement |
| `pnpm typecheck` | vérifie les types des paquets |
| `pnpm test:db` | tests de sécurité de la base (Linux, macOS ou WSL ; avec la base Docker : `PGHOST=localhost PGPORT=5433 PGSUPER=ceremonia PGPASSWORD=ceremonia-local pnpm test:db`) |

## 6. En cas de problème

- **« connect ECONNREFUSED 127.0.0.1:5433 »** : ouvrez Docker Desktop, attendez qu’il soit prêt, relancez `pnpm db:start`.
- **Port déjà utilisé** : fermez l’application qui utilise 3000, 3100 ou 5433.
- **Connexion admin refusée** : utilisez bien http://127.0.0.1:3100 (et non `localhost:3100`).
- **Fichiers .env.local à recréer** : `pnpm setup:env --force`.
- **Mise en ligne** : voir `docs/DEPLOIEMENT-RENDER.md`.
