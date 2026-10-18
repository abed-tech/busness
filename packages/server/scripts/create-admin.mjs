#!/usr/bin/env node
// Crée un compte administrateur (par défaut administrateur principal) ; « --role moderator|manager » pour les autres rôles.
// Usage : DATABASE_URL="<External Database URL de Render>" DATABASE_SSL=no-verify \
//           node packages/server/scripts/create-admin.mjs admin@votre-domaine "Votre nom" [--role super|moderator|manager]
// Le mot de passe est demandé (non affiché) ; au premier passage sur l'admin, le second facteur est exigé.
// Refuse un compte organisateur existant (un organisateur ne devient jamais administrateur).
import pg from "pg"; import readline from "node:readline";
const args = process.argv.slice(2);
const ri = args.indexOf("--role");
const role = ri >= 0 ? args.splice(ri, 2)[1] : "super";
const [email, name] = args;
if (!["super", "moderator", "manager"].includes(role)) { console.error("--role : super, moderator ou manager"); process.exit(1); }
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) { console.error('Usage : create-admin.mjs <e-mail> "<nom affiché>"'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL manquante."); process.exit(1); }
function ask(q) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); res(a); });
  });
}
const pw = process.env.ADMIN_PASSWORD || await ask("Mot de passe (12 caractères minimum) : ");
if (pw.length < 12) { console.error("Mot de passe trop court (12 caractères minimum)."); process.exit(1); }
const ssl = process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await c.connect();
try {
  await c.query("begin");
  const ex = await c.query("select id from auth.users where lower(email) = lower($1)", [email]);
  let id = ex.rows[0]?.id;
  if (id) {
    const org = await c.query("select 1 from public.profiles where id = $1", [id]);
    if (org.rows.length) throw new Error("Ce compte est un compte organisateur : il ne peut pas devenir administrateur. Utilisez une autre adresse.");
    await c.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)), email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [id, pw]);
  } else {
    id = (await c.query("insert into auth.users (email, encrypted_password, email_confirmed_at, aud, role) values (lower($1), extensions.crypt($2, extensions.gen_salt('bf', 10)), now(), 'authenticated', 'authenticated') returning id", [email, pw])).rows[0].id;
  }
  await c.query("insert into public.admin_users (user_id, role, display_name) values ($1, $3, $2) on conflict (user_id) do update set role = excluded.role, active = true, display_name = excluded.display_name", [id, name, role]);
  await c.query("commit");
  console.log(`Compte administrateur prêt (${role}) : ${email}. Connectez-vous sur l'admin ; le second facteur sera demandé.`);
} catch (e) { await c.query("rollback").catch(() => {}); console.error(e.message); process.exitCode = 1; }
finally { await c.end(); }
