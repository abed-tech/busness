import { withCtx, asOwner, type Ctx, type Queryable } from "./db";

/**
 * Client de données au format du client Supabase utilisé jusqu'ici (from / select / eq / order / insert / update /
 * delete / rpc), traduit en SQL paramétré et exécuté avec le rôle et l'identité de l'utilisateur.
 * Seul le sous-ensemble réellement utilisé par les applications est pris en charge.
 * Les noms de tables, colonnes et fonctions sont validés ; toutes les valeurs passent en paramètres.
 */
export type DbError = { message: string; code: string; details?: string | null; hint?: string | null };
export type Result<T = any> = { data: T; error: DbError | null; count: number | null; status: number };

const IDENT = /^[a-z_][a-z0-9_]*$/;
const id = (s: string) => {
  if (!IDENT.test(s)) throw new Error(`Identifiant SQL refusé : ${s}`);
  return `"${s}"`;
};
function columns(sel: string): string {
  const s = sel.trim();
  if (s === "*") return "*";
  return s.split(",").map((c) => id(c.trim())).join(", ");
}

export function toDbError(e: unknown): DbError {
  const x = e as { message?: string; code?: string; detail?: string; hint?: string };
  if (x && typeof x.code === "string" && /^[0-9A-Z]{5}$/.test(x.code)) return { message: x.message || "Erreur", code: x.code, details: x.detail ?? null, hint: x.hint ?? null };
  console.error("Base de données :", x?.message || e);
  return { message: "network error: base de données indisponible", code: "NETWORK" };
}
const fail = <T>(e: unknown): Result<T> => ({ data: null as T, error: toDbError(e), count: null, status: 500 });

type Op = "eq" | "neq" | "in" | "is" | "gt" | "gte" | "lt" | "lte";
type Filter = { col: string; op: Op; val: unknown };
type Mode = "select" | "insert" | "update" | "delete";

export class Query<T = any> implements PromiseLike<Result<T>> {
  private mode: Mode = "select";
  private cols = "*";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private one: "single" | "maybe" | null = null;
  private payload: unknown = null;
  private returning: string | null = null;
  private wantCount = false;

  constructor(private ctx: Ctx, private table: string) { id(table); }

  select(cols = "*", opts?: { count?: "exact" }): this {
    if (this.mode === "select") this.cols = cols; else this.returning = cols;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[]): this { this.mode = "insert"; this.payload = values; return this; }
  update(values: Record<string, unknown>, opts?: { count?: "exact" }): this { this.mode = "update"; this.payload = values; this.wantCount = !!opts?.count; return this; }
  delete(opts?: { count?: "exact" }): this { this.mode = "delete"; this.wantCount = !!opts?.count; return this; }
  private f(col: string, op: Op, val: unknown): this { id(col); this.filters.push({ col, op, val }); return this; }
  eq(col: string, val: unknown) { return this.f(col, "eq", val); }
  neq(col: string, val: unknown) { return this.f(col, "neq", val); }
  in(col: string, vals: unknown[]) { return this.f(col, "in", vals); }
  is(col: string, val: null | boolean) { return this.f(col, "is", val); }
  gt(col: string, val: unknown) { return this.f(col, "gt", val); }
  gte(col: string, val: unknown) { return this.f(col, "gte", val); }
  lt(col: string, val: unknown) { return this.f(col, "lt", val); }
  lte(col: string, val: unknown) { return this.f(col, "lte", val); }
  order(col: string, opts?: { ascending?: boolean }): this { id(col); this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number): this { this.lim = Math.max(0, Math.floor(n)); return this; }
  single(): this { this.one = "single"; return this; }
  maybeSingle(): this { this.one = "maybe"; return this; }

  private where(params: unknown[]): string {
    if (!this.filters.length) return "";
    const parts = this.filters.map(({ col, op, val }) => {
      const c = id(col);
      if (op === "is") return val === null ? `${c} is null` : val ? `${c} is true` : `${c} is false`;
      params.push(val);
      const p = `$${params.length}`;
      return op === "eq" ? `${c} = ${p}` : op === "neq" ? `${c} <> ${p}` : op === "in" ? `${c} = any(${p})` : op === "gt" ? `${c} > ${p}` : op === "gte" ? `${c} >= ${p}` : op === "lt" ? `${c} < ${p}` : `${c} <= ${p}`;
    });
    return " where " + parts.join(" and ");
  }

  /** Une instruction par ensemble de colonnes : une colonne absente garde sa valeur par défaut (jamais NULL forcé). */
  private buildInserts(): { text: string; params: unknown[] }[] {
    const t = `public.${id(this.table)}`;
    const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Record<string, unknown>[];
    if (!rows.length) throw new Error("insertion vide");
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const r of rows) { const k = Object.keys(r).sort().join(","); if (!k) throw new Error("insertion vide"); groups.set(k, [...(groups.get(k) || []), r]); }
    const ret = this.returning ? columns(this.returning) : "1 as x";
    return [...groups.entries()].map(([key, rs]) => {
      const k = key.split(",").map(id).join(", ");
      return { text: `with w as (insert into ${t} (${k}) select ${k} from jsonb_populate_recordset(null::${t}, $1::jsonb) returning ${ret}) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) as data, count(*)::int as n from w`, params: [JSON.stringify(rs)] };
    });
  }

  private build(): { text: string; params: unknown[] } {
    const t = `public.${id(this.table)}`;
    const params: unknown[] = [];
    if (this.mode === "select") {
      const w = this.where(params);
      const o = this.orders.length ? " order by " + this.orders.map((x) => `${id(x.col)} ${x.asc ? "asc" : "desc"} nulls last`).join(", ") : "";
      const l = this.lim != null ? ` limit ${this.lim}` : "";
      return { text: `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as data, count(*)::int as n from (select ${columns(this.cols)} from ${t}${w}${o}${l}) t`, params };
    }
    if (this.mode === "insert") throw new Error("insert: utiliser buildInserts");
    if (this.mode === "update") {
      const keys = Object.keys((this.payload || {}) as object);
      if (!keys.length) throw new Error("mise à jour vide");
      const k = keys.map(id).join(", ");
      params.push(JSON.stringify(this.payload));
      const w = this.where(params);
      const ret = this.returning ? columns(this.returning) : "1 as x";
      const set = keys.length === 1 ? `${k} = (select ${k} from jsonb_populate_record(null::${t}, $1::jsonb))` : `(${k}) = (select ${k} from jsonb_populate_record(null::${t}, $1::jsonb))`;
      return { text: `with w as (update ${t} set ${set}${w} returning ${ret}) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) as data, count(*)::int as n from w`, params };
    }
    const w = this.where(params);
    const ret = this.returning ? columns(this.returning) : "1 as x";
    return { text: `with w as (delete from ${t}${w} returning ${ret}) select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) as data, count(*)::int as n from w`, params };
  }

  async run(): Promise<Result<T>> {
    let stmts: { text: string; params: unknown[] }[];
    try { stmts = this.mode === "insert" ? this.buildInserts() : [this.build()]; } catch (e) { return { data: null as T, error: { message: (e as Error).message, code: "22023" }, count: null, status: 400 }; }
    let rows: unknown[] = []; let n = 0;
    try {
      await withCtx(this.ctx, async (q) => {
        for (const st of stmts) { const r = await q.query(st.text, st.params); rows = rows.concat((r.rows[0]?.data as unknown[]) || []); n += Number(r.rows[0]?.n || 0); }
      });
    } catch (e) { return fail<T>(e); }
    const count = this.wantCount ? n : null;
    const returnsRows = this.mode === "select" || this.returning != null;
    if (!returnsRows) return { data: null as T, error: null, count, status: this.mode === "insert" ? 201 : 204 };
    if (this.one) {
      if (rows.length > 1 || (this.one === "single" && rows.length === 0)) {
        return { data: null as T, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116", details: `${rows.length} lignes` }, count, status: 406 };
      }
      return { data: (rows[0] ?? null) as T, error: null, count, status: 200 };
    }
    return { data: rows as T, error: null, count, status: 200 };
  }

  then<A = Result<T>, B = never>(ok?: ((v: Result<T>) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, ko);
  }
}

// Fonctions sans résultat (void) : appelées sans conversion JSON.
let voidFns: Promise<Set<string>> | null = null;
function voidFunctions(): Promise<Set<string>> {
  if (!voidFns) {
    voidFns = asOwner((q) => q.query("select proname from pg_proc where pronamespace = 'public'::regnamespace and prorettype = 'void'::regtype"))
      .then((r) => new Set(r.rows.map((x: { proname: string }) => x.proname)))
      .catch((e) => { voidFns = null; throw e; });
  }
  return voidFns;
}

export async function rpc<T = any>(ctx: Ctx, fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  try {
    const f = id(fn);
    const names = Object.keys(args);
    const values = names.map((k) => args[k]);
    const call = `public.${f}(${names.map((k, i) => `${id(k)} => $${i + 1}`).join(", ")})`;
    const isVoid = (await voidFunctions()).has(fn);
    const r = await withCtx(ctx, (q: Queryable) => q.query(isVoid ? `select ${call}` : `select to_jsonb(${call}) as data`, values));
    return { data: (isVoid ? null : r.rows[0]?.data ?? null) as T, error: null, count: null, status: 200 };
  } catch (e) {
    return fail<T>(e);
  }
}

/** Client lié à un contexte (utilisateur connecté ou anonyme). */
export function dataClient(ctx: Ctx) {
  return {
    ctx,
    from: <T = any>(table: string) => new Query<T>(ctx, table),
    rpc: <T = any>(fn: string, args: Record<string, unknown> = {}) => rpc<T>(ctx, fn, args),
  };
}
export type DataClient = ReturnType<typeof dataClient>;
