// Crée les fichiers .env.local des deux applications pour la base PostgreSQL locale (docker-compose.yml).
// Usage : pnpm setup:env   (ajoutez --force pour remplacer des fichiers existants)
import { existsSync, writeFileSync } from "node:fs";

const DB = "postgresql://ceremonia:ceremonia-local@localhost:5433/ceremonia";
const files = {
  "apps/web/.env.local": `# Généré par scripts/setup-env.mjs — environnement LOCAL (jamais en ligne)
DATABASE_URL=${DB}
ORGANIZER_ORIGIN=http://localhost:3000
ADMIN_ORIGIN=http://127.0.0.1:3100
# Paiement de test local : aucun prestataire appelé, confirmation par « pnpm dev:confirm-payment <référence> »
DEV_PAYMENTS=1
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CINETPAY_API_KEY=
CINETPAY_SITE_ID=
CINETPAY_SECRET_KEY=
# E-mails : en local, les liens (confirmation, mot de passe oublié) s'affichent dans le terminal
RESEND_API_KEY=
MAIL_FROM=
`,
  "apps/admin/.env.local": `# Généré par scripts/setup-env.mjs — environnement LOCAL (jamais en ligne)
DATABASE_URL=${DB}
ADMIN_ORIGIN=http://127.0.0.1:3100
ORGANIZER_ORIGIN=http://localhost:3000
ADMIN_IDLE_MINUTES=30
`,
};
for (const [f, c] of Object.entries(files)) {
  if (existsSync(f) && !process.argv.includes("--force")) { console.log(`${f} existe déjà (ajoutez --force pour le remplacer).`); continue; }
  writeFileSync(f, c);
  console.log(`${f} créé.`);
}
