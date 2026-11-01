// Lance l'espace organisateur (3000) et l'espace admin (3100) sans pnpm, par exemple sous Windows.
// Usage : npm run dev:local   (ou : node scripts/dev-local.mjs)   — Ctrl+C arrête les deux.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const apps = [
  { name: "web  ", dir: "apps/web", args: ["dev", "-p", "3000"], port: 3000, host: "0.0.0.0" },
  { name: "admin", dir: "apps/admin", args: ["dev", "-p", "3100", "-H", "127.0.0.1"], port: 3100, host: "127.0.0.1" },
];

const portFree = (port, host) => new Promise((resolve) => {
  const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
  s.listen(port, host);
});

for (const a of apps) {
  if (!existsSync(path.join(a.dir, ".env.local"))) { console.error(`${a.dir}/.env.local manquant : lancez « node scripts/setup-env.mjs ».`); process.exit(1); }
  if (!(await portFree(a.port, a.host))) {
    console.error(`Le port ${a.port} est déjà utilisé (une ancienne instance tourne peut-être encore).`);
    console.error(`Libérez-le dans PowerShell : Stop-Process -Id (Get-NetTCPConnection -LocalPort ${a.port} -State Listen).OwningProcess`);
    process.exit(1);
  }
}

const children = apps.map((a) => {
  const next = path.resolve(a.dir, "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [next, ...a.args], { cwd: a.dir, env: process.env });
  const prefix = (chunk) => chunk.toString().split(/\r?\n/).filter(Boolean).map((l) => `[${a.name}] ${l}`).join("\n") + "\n";
  child.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  child.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  child.on("exit", (code) => { console.log(`[${a.name}] arrêté (code ${code}).`); stopAll(); });
  return child;
});

console.log("Organisateur : http://localhost:3000   Admin : http://127.0.0.1:3100   (premier affichage lent : compilation)");

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
