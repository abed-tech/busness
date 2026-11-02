#!/usr/bin/env node
// Premier administrateur créé au démarrage du service admin, à partir des variables Render :
//   ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD (12 caractères minimum), ADMIN_BOOTSTRAP_NAME (facultatif).
// Sécurité : n'agit QUE si aucun administrateur n'existe encore. Dès qu'un administrateur existe, les variables sont
// ignorées (elles ne peuvent ni changer un mot de passe ni créer un second compte) : supprimez-les après la création.
// Le second facteur (TOTP) est exigé à la première connexion. Une adresse d'organisateur est refusée.
// Une erreur n'empêche jamais le démarrage du service : elle est seulement écrite dans les journaux.
import pg from "pg";
const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const pw = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
const name = (process.env.ADMIN_BOOTSTRAP_NAME || "Administrateur").trim().slice(0, 80);
if (!email) process.exit(0);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("ADMIN_BOOTSTRAP_EMAIL invalide : aucun administrateur créé."); process.exit(0); }
if (pw.length < 12 || pw.length > 72) { console.error("ADMIN_BOOTSTRAP_PASSWORD : 12 à 72 caractères. Aucun administrateur créé."); process.exit(0); }
const ssl = process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined;
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
try {
  await c.connect();
  await c.query("begin");
  await c.query("lock table public.admin_users in exclusive mode"); // les deux services démarrent en même temps
  if ((await c.query("select 1 from public.admin_users limit 1")).rows.length) {
    await c.query("rollback");
    console.log("Administrateur déjà existant : ADMIN_BOOTSTRAP_* ignorées (supprimez-les de Render > Environment).");
  } else {
    const ex = await c.query("select id from auth.users where lower(email) = $1", [email]);
    if (ex.rows.length) throw new Error("ADMIN_BOOTSTRAP_EMAIL appartient déjà à un compte existant (organisateur) : utilisez une autre adresse.");
    const id = (await c.query(
      "insert into auth.users (email, encrypted_password, email_confirmed_at, aud, role) values ($1, extensions.crypt($2, extensions.gen_salt('bf', 10)), now(), 'authenticated', 'authenticated') returning id",
      [email, pw])).rows[0].id;
    await c.query("insert into public.admin_users (user_id, role, display_name) values ($1, 'super', $2)", [id, name]);
    await c.query("commit");
    console.log(`Administrateur principal créé : ${email}. Connectez-vous sur l'admin (second facteur demandé), puis supprimez ADMIN_BOOTSTRAP_* de Render.`);
  }
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("Création de l'administrateur impossible :", e.message);
} finally {
  await c.end().catch(() => {});
}
