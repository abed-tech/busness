// Compile le vrai code des deux applications (actions serveur, routes) avec des remplaçants de Next.js.
// PG_DRIVER=<fichier> remplace « pg » (bac à sable sans registre npm) ; sinon le vrai paquet « pg » est utilisé.
import * as esbuild from "esbuild";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const stub = path.join(here, "stubs.ts");
for (const app of ["web", "admin"]) {
  const A = path.join(root, "apps", app);
  await esbuild.build({
    entryPoints: [path.join(here, `${app}-entry.ts`)], bundle: true, platform: "node", format: "cjs", outfile: path.join(here, `.${app}.cjs`),
    logLevel: "warning", jsx: "automatic",
    external: process.env.PG_DRIVER ? [] : ["pg"],
    alias: process.env.PG_DRIVER ? { pg: path.resolve(process.env.PG_DRIVER) } : {},
    plugins: [{ name: "stubs", setup(b) {
      b.onResolve({ filter: /^(next\/headers|next\/navigation|next\/cache|next\/server|server-only|react|qrcode)$/ }, () => ({ path: stub }));
      b.onResolve({ filter: /^@ceremonia\/server$/ }, () => ({ path: path.join(root, "packages/server/src/index.ts") }));
      b.onResolve({ filter: /^@ceremonia\/core$/ }, () => ({ path: path.join(root, "packages/core/src/index.ts") }));
      b.onResolve({ filter: /^@\// }, (a) => { const base = path.join(A, a.path.slice(2)); for (const e of [".ts", ".tsx", "/index.ts"]) if (fs.existsSync(base + e)) return { path: base + e }; });
    } }],
  });
}
