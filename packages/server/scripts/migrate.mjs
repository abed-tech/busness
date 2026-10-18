#!/usr/bin/env node
// Applique les migrations SQL manquantes, dans l'ordre, chacune dans sa propre transaction.
// Usage : node packages/server/scripts/migrate.mjs [dossier]   (défaut : db/migrations ; DATABASE_URL obligatoire)
// - Verrou consultatif : deux services qui démarrent ensemble ne migrent jamais en même temps.
// - Une migration déjà appliquée n'est jamais rejouée ; si son contenu a changé, l'exécution s'arrête (protection des données).
// - Aucune migration n'est annulée ni supprimée automatiquement.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { loadEnvFile } from "./local-guard.mjs";

const LOCK = 742000;

export async function migrate({ connectionString, dir, log = console.log, ssl }) {
  const files = fs.readdirSync(dir).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const client = new pg.Client({ connectionString, ssl });
  await client.connect();
  const applied = [];
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
    await client.query("create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now())");
    await client.query("alter table public.schema_migrations add column if not exists checksum text");
    const done = new Map((await client.query("select version, checksum from public.schema_migrations")).rows.map((r) => [r.version, r.checksum]));
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      const sum = crypto.createHash("sha256").update(sql).digest("hex");
      const version = f.slice(0, 14);
      if (done.has(version)) {
        const prev = done.get(version);
        if (prev && prev !== sum) throw new Error(`La migration ${f} a été modifiée après son application. Créez une nouvelle migration au lieu de modifier celle-ci.`);
        continue;
      }
      log(`migration ${f}…`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (version, checksum) values ($1, $2)", [version, sum]);
        await client.query("commit");
        applied.push(f);
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw new Error(`Échec de ${f} : ${e.message} (rien n'a été appliqué pour ce fichier)`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => undefined);
    await client.end();
  }
  log(applied.length ? `${applied.length} migration(s) appliquée(s).` : "Base à jour : aucune migration à appliquer.");
  return applied;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const dir = path.resolve(process.argv[2] || "db/migrations");
  if (!process.env.DATABASE_URL) loadEnvFile("apps/web/.env.local"); // développement local
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error("DATABASE_URL manquante."); process.exit(1); }
  const ssl = process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined;
  migrate({ connectionString, dir, ssl }).catch((e) => { console.error(e.message); process.exit(1); });
}
