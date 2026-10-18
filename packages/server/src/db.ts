import pg from "pg";

/**
 * Connexion à PostgreSQL (Render). Une seule réserve de connexions par processus.
 * Chaque requête applicative s'exécute dans une transaction qui bascule sur un rôle d'accès
 * (anon, authenticated, service_role) et pose l'identité de l'utilisateur : les règles RLS
 * et les droits définis par les migrations s'appliquent exactement comme avant.
 */
export type Role = "anon" | "authenticated" | "service_role";
export type Claims = { sub?: string; email?: string; aal?: "aal1" | "aal2"; role?: Role; [k: string]: unknown };
export type Ctx = { role: Role; claims: Claims };
export type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

const ROLES: Record<Role, string> = { anon: "anon", authenticated: "authenticated", service_role: "service_role" };

type G = typeof globalThis & { __cerPool?: pg.Pool };

function sslOption(): pg.PoolConfig["ssl"] {
  // URL interne Render (même région) : sans TLS. URL externe : DATABASE_SSL=no-verify (certificat géré par Render).
  const m = process.env.DATABASE_SSL;
  if (m === "no-verify") return { rejectUnauthorized: false };
  if (m === "require") return { rejectUnauthorized: true };
  return undefined;
}

export function pool(): pg.Pool {
  const g = globalThis as G;
  if (!g.__cerPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL manquante : définissez-la (Render > Environment, ou .env.local en local).");
    g.__cerPool = new pg.Pool({
      connectionString,
      ssl: sslOption(),
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: process.env.APP_NAME || "ceremonia",
    });
    g.__cerPool.on("error", (e: Error) => console.error("PostgreSQL :", e.message));
  }
  return g.__cerPool;
}

/** Transaction au nom d'un utilisateur (ou anonyme) : rôle d'accès + identité, puis validation ou annulation. */
export async function withCtx<T>(ctx: Ctx, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const role = ROLES[ctx.role];
  if (!role) throw new Error("rôle inconnu");
  const c = await pool().connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ ...ctx.claims, role })]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    try { await c.query("rollback"); } catch { /* connexion déjà rompue */ }
    throw e;
  } finally {
    c.release();
  }
}

/** Transaction avec le compte propriétaire (tables « auth », tâches planifiées, migrations). Jamais pour une donnée demandée par un client sans vérification. */
export async function asOwner<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    try { await c.query("rollback"); } catch { /* ignoré */ }
    throw e;
  } finally {
    c.release();
  }
}

export const ANON: Ctx = { role: "anon", claims: {} };
export const SERVICE: Ctx = { role: "service_role", claims: {} };
