# Permissions

## Espace administrateur

La source de vérité est la table `public.role_permissions` (migration `20261013000100_core.sql`).
Chaque fonction d’administration commence par `private.has_perm('<permission>')`, qui exige :

1. un compte présent dans `admin_users` **et actif** ;
2. une session au niveau **aal2** (second facteur TOTP validé) ;
3. la permission attachée au rôle.

L’interface masque les actions non permises **uniquement pour le confort** : un appel direct à l’API
avec un rôle insuffisant est refusé par la base et inscrit au journal (`result = 'denied'`).

## Matrice

| Permission | Administrateur principal | Modérateur | Gestionnaire |
|---|:-:|:-:|:-:|
| `dashboard.read` — tableau de bord | ✔ | ✔ | ✔ |
| `events.read` — liste et détail des événements | ✔ | ✔ | ✔ |
| `events.create` — créer un événement gratuit | ✔ | ✔ | — |
| `events.write` — modifier, invités, tables | ✔ | ✔ | — |
| `events.suspend` — suspendre / réactiver | ✔ | ✔ | — |
| `events.delete` — supprimer (confirmation par le titre) | ✔ | ✔ | — |
| `guests.read` — liste des invités (noms, contacts, tables) | ✔ | ✔ | — |
| `organizers.read` — comptes organisateurs | ✔ | ✔ | ✔ |
| `organizers.suspend` — suspendre / réactiver un compte | ✔ | ✔ | — |
| `finance.read` — transactions, revenus, montants | ✔ | — | ✔ |
| `finance.refund` — réservé (remboursements) | ✔ | — | — |
| `reports.read` — rapports mensuels | ✔ | ✔ (sans chiffres financiers) | ✔ |
| `reports.export` — exports CSV (journalisés) | ✔ | — | ✔ |
| `audit.read` — journal d’activité | ✔ | — | — |
| `admins.manage` — nommer, changer de rôle, désactiver | ✔ | — | — |
| `settings.write` — conservation, tarif, limites | ✔ | — | — |
| `security.read` — alertes de sécurité | ✔ | ✔ | — |

Le Gestionnaire n’a **aucune** permission d’écriture : il lit les statistiques et les rapports.
Le Modérateur ne voit **aucun** montant : les fonctions retirent les champs financiers quand `finance.read` manque.

## Données jamais visibles par l’administration

Les choix privés des invités (boissons et plats commandés, table `guest_orders`) ne sont lisibles que par
l’organisateur de l’événement (`orders_owner_read`). L’administration voit seulement des **totaux** par table.
Les mots de passe des contrôleurs et serveurs ne sont jamais sélectionnables (droits par colonne).

## Règles de séparation

- Un compte organisateur ne peut pas recevoir de rôle d’administration, et un compte administrateur ne peut pas
  devenir organisateur (déclencheurs `admin_users_not_organizer` et `profiles_not_admin`).
- L’application admin refuse toute requête qui n’arrive pas par `ADMIN_ORIGIN` (middleware) ; l’application
  organisateur ne contient aucune route d’administration.
- Il reste toujours au moins un administrateur principal actif (`admin_set_role`).
- Le journal `audit_log` est en ajout seul : mise à jour, suppression et `TRUNCATE` sont bloqués par déclencheurs,
  y compris pour l’administrateur principal.

## Modifier la matrice

Écrire une nouvelle migration (`insert` / `delete` sur `role_permissions`), mettre à jour ce document et
`apps/admin/lib/perms.ts` (miroir d’affichage), puis relancer `db/tests/run.sh`.

## Espace organisateur, invités et personnel

| Qui | Comment il s’identifie | Ce qu’il peut faire (vérifié par la base) |
|---|---|---|
| Organisateur | compte e-mail + mot de passe (authentification de la plateforme, mot de passe bcrypt), profil créé à l’inscription | lire et modifier **ses** événements (propriétaire, ou organisateur associé par l’administration avec l’option « peut gérer ») ; compte suspendu ou événement suspendu = lecture seule (`private.org_access`) |
| Invité | lien personnel `/i/<jeton>` (18 caractères aléatoires), sans compte | lire **sa** invitation et répondre (`get_invitation`, `submit_rsvp`) ; choix vérifiés : une boisson et un plat par personne, pris dans la liste de l’événement ; réponse figée après l’entrée |
| Contrôleur | lien `/k/<événement>/<accès>` + code + mot de passe (bcrypt, blocage 5 min après 5 échecs), jeton de session haché, cookie httpOnly 12 h | chercher un invité par QR ou code, **confirmer l’entrée une seule fois** (clé primaire) ; ne voit jamais les commandes |
| Serveur | idem | voir la commande de l’invité scanné, **enregistrer une prestation une seule fois** par type ; ne voit jamais la liste des invités |
| Personnel de service | lien `/s/<événement>/<clé>` renouvelable | quantités à servir par table, **aucun nom** |

Règles transversales :

- Un événement payant n’ouvre ses invitations qu’après un **premier paiement confirmé** par le prestataire
  (`private.invitations_open`) ; l’envoi de nouvelles invitations exige que le solde soit réglé (`mark_invitations_sent`).
- Le montant est toujours calculé par la base (`create_checkout`, `event_billing`) ; seul un webhook signé peut confirmer un paiement.
- Révoquer un accès ou changer son mot de passe invalide immédiatement ses sessions (`session_version`).
- Photos : écriture réservée à qui peut modifier l’événement (règles du stockage `event-photos`), 4 au maximum, type vérifié par signature.
