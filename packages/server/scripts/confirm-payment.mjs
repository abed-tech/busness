#!/usr/bin/env node
// LOCAL UNIQUEMENT : simule la confirmation d'un paiement par le prestataire (comme le ferait le webhook).
// Usage : pnpm dev:confirm-payment CRM-XXXXXXXXXX
// Passe par la même fonction que les vrais webhooks (apply_payment_event) : montant vérifié, preuve enregistrée, journal.
import pg from "pg";
import { requireLocalDatabase, loadEnvFile } from "./local-guard.mjs";
loadEnvFile("apps/web/.env.local");
const ref = process.argv[2] || "";
if (!/^CRM-[A-Z0-9]{6,12}$/.test(ref)) { console.error("Usage : pnpm dev:confirm-payment CRM-XXXXXXXXXX (référence affichée sur la page de paiement)"); process.exit(1); }
const c = new pg.Client({ connectionString: requireLocalDatabase() });
await c.connect();
try {
  const t = await c.query("select provider, amount_cents from public.transactions where reference = $1", [ref]);
  if (!t.rows.length) throw new Error(`Référence inconnue : ${ref}`);
  const r = await c.query("select public.apply_payment_event($1, $2, $3, 'succeeded', 'dev-local', $4, '{\"dev_local\": true}'::jsonb) as r", [t.rows[0].provider, "dev-" + ref, ref, t.rows[0].amount_cents]);
  console.log("Résultat :", JSON.stringify(r.rows[0].r));
  console.log(`Paiement ${ref} confirmé en local. Rechargez la page.`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await c.end(); }
