#!/usr/bin/env node
// LOCAL UNIQUEMENT : charge les données de démonstration (db/seed.sql). Rejouable.
import fs from "node:fs"; import pg from "pg";
import { requireLocalDatabase, loadEnvFile } from "./local-guard.mjs";
loadEnvFile("apps/web/.env.local");
const cs = requireLocalDatabase();
const c = new pg.Client({ connectionString: cs });
await c.connect();
try { await c.query(fs.readFileSync("db/seed.sql", "utf8")); console.log("Données de démonstration chargées (local)."); }
catch (e) { console.error("Échec du chargement :", e.message); process.exitCode = 1; }
finally { await c.end(); }
