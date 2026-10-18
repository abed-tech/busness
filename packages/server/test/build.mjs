// Compile le paquet pour node:test. PG_DRIVER=<fichier> remplace « pg » (bac à sable sans accès au registre npm).
import * as esbuild from "esbuild";
import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const alias = process.env.PG_DRIVER ? { pg: path.resolve(process.env.PG_DRIVER) } : {};
await esbuild.build({ entryPoints: [path.join(here, "../src/index.ts")], bundle: true, platform: "node", format: "cjs", outfile: path.join(here, ".bundle.cjs"), alias, external: process.env.PG_DRIVER ? [] : ["pg"], logLevel: "warning" });
