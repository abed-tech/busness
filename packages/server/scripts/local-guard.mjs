import fs from "node:fs";

/** Refuse toute commande « locale » (démonstration, paiement simulé) hors d'une base locale. */
export function requireLocalDatabase(cs = process.env.DATABASE_URL) {
  if (!cs) { console.error("DATABASE_URL manquante : lancez « pnpm setup:env » (crée apps/web/.env.local)."); process.exit(1); }
  const u = new URL(cs);
  const host = u.searchParams.get("host") || u.hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && !host.startsWith("/")) {
    console.error(`Refusé : « ${host} » n'est pas une base locale. Cette commande ne s'exécute jamais sur la base en ligne.`);
    process.exit(1);
  }
  return cs;
}

/** Lecture minimale d'un fichier .env (CLÉ=valeur), sans dépendance ; ne remplace pas une variable déjà définie. */
export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
