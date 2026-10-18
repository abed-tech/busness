import { createHash, randomBytes } from "node:crypto";
import { asOwner } from "./db";
import { newSecret, otpauthUri, verifyTotp } from "./totp";

/**
 * Comptes et sessions (remplace Supabase Auth).
 * - Mots de passe : bcrypt calculé par PostgreSQL (pgcrypto), jamais lisible par les rôles d'accès.
 * - Sessions : jeton aléatoire de 256 bits dans un cookie httpOnly ; seule son empreinte SHA-256 est en base.
 * - Second facteur : TOTP, obligatoire pour l'admin (niveau aal2 porté par la session).
 */
export type App = "org" | "admin";
export type Session = { sessionId: string; userId: string; email: string; aal: "aal1" | "aal2" };

const sha = (s: string) => createHash("sha256").update(s).digest();
const newToken = () => randomBytes(32).toString("base64url");
const TTL_HOURS: Record<App, number> = { org: 24 * 30, admin: 12 };
const normEmail = (e: string) => e.trim().toLowerCase();

export async function createUser(email: string, password: string, confirmed: boolean, meta: Record<string, string> = {}): Promise<{ ok: true; userId: string } | { ok: false; error: "exists" }> {
  try {
    const r = await asOwner((q) => q.query(
      `insert into auth.users (email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
       values ($1, extensions.crypt($2, extensions.gen_salt('bf', 10)), case when $3::boolean then now() end, 'authenticated', 'authenticated', $4::jsonb)
       returning id::text`, [normEmail(email), password, confirmed, JSON.stringify(meta)]));
    return { ok: true, userId: r.rows[0].id };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: "exists" };
    throw e;
  }
}

/** Vérifie e-mail + mot de passe (temps constant que le compte existe ou non), avec limitation des tentatives. */
export async function checkPassword(email: string, password: string, opts: { throttle?: boolean } = {}):
  Promise<{ ok: true; userId: string; confirmed: boolean } | { ok: false; error: "invalid" | "rate_limited" }> {
  const e = normEmail(email);
  const h = sha("login:" + e);
  return asOwner(async (q) => {
    if (opts.throttle !== false) {
      const t = await q.query("select count(*)::int as n from auth.failed_logins where email_hash = $1 and at > now() - interval '15 minutes'", [h]);
      if (t.rows[0].n >= 10) return { ok: false as const, error: "rate_limited" as const };
    }
    const r = await q.query(
      `select u.id::text, u.email_confirmed_at is not null as confirmed,
              coalesce(u.encrypted_password, '') = extensions.crypt($2, coalesce(u.encrypted_password, '$2a$10$abcdefghijklmnopqrstuu')) as ok
         from (select 1) x left join auth.users u on lower(u.email) = $1`, [e, password]);
    const row = r.rows[0];
    if (!row?.id || !row.ok) {
      // compte inexistant : bcrypt calculé quand même sur une empreinte factice (temps de réponse identique)
      await q.query("insert into auth.failed_logins (email_hash) values ($1)", [h]);
      return { ok: false as const, error: "invalid" as const };
    }
    await q.query("delete from auth.failed_logins where email_hash = $1", [h]);
    return { ok: true as const, userId: row.id as string, confirmed: !!row.confirmed };
  });
}

export async function createSession(userId: string, app: App, meta: { ip?: string; userAgent?: string } = {}): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL_HOURS[app] * 3600_000);
  await asOwner(async (q) => {
    await q.query("insert into auth.sessions (user_id, app, token_hash, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5, $6)",
      [userId, app, sha(token), expiresAt.toISOString(), (meta.ip || "").slice(0, 64), (meta.userAgent || "").slice(0, 300)]);
    await q.query("update auth.users set last_sign_in_at = now() where id = $1", [userId]);
  });
  return { token, expiresAt };
}

/** Session valide pour ce jeton et cette application. Inactivité : session supprimée au-delà de idleMinutes. */
export async function getSession(token: string | undefined | null, app: App, idleMinutes?: number): Promise<Session | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  return asOwner(async (q) => {
    const r = await q.query(
      `select s.id::text as sid, s.user_id::text as uid, u.email, s.aal, extract(epoch from now() - s.last_seen_at)::int as idle_s
         from auth.sessions s join auth.users u on u.id = s.user_id
        where s.token_hash = $1 and s.app = $2 and s.expires_at > now()`, [sha(token), app]);
    const s = r.rows[0];
    if (!s) return null;
    if (idleMinutes && s.idle_s > idleMinutes * 60) {
      await q.query("delete from auth.sessions where id = $1", [s.sid]);
      return null;
    }
    if (s.idle_s > 60) await q.query("update auth.sessions set last_seen_at = now() where id = $1", [s.sid]);
    return { sessionId: s.sid, userId: s.uid, email: s.email, aal: s.aal };
  });
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await asOwner((q) => q.query("delete from auth.sessions where token_hash = $1", [sha(token)]));
}
export async function deleteUserSessions(userId: string, app?: App): Promise<void> {
  await asOwner((q) => (app ? q.query("delete from auth.sessions where user_id = $1 and app = $2", [userId, app]) : q.query("delete from auth.sessions where user_id = $1", [userId])));
}

// ---------- mots de passe et jetons à usage unique ----------
export async function setPassword(userId: string, password: string): Promise<void> {
  await asOwner((q) => q.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)), updated_at = now() where id = $1", [userId, password]));
}
export async function confirmEmail(userId: string): Promise<void> {
  await asOwner((q) => q.query("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [userId]));
}
export async function userMeta(userId: string): Promise<Record<string, string>> {
  const r = await asOwner((q) => q.query("select coalesce(raw_user_meta_data, '{}'::jsonb) as m from auth.users where id = $1", [userId]));
  return (r.rows[0]?.m as Record<string, string>) || {};
}
export async function userIdByEmail(email: string): Promise<string | null> {
  const r = await asOwner((q) => q.query("select id::text from auth.users where lower(email) = $1", [normEmail(email)]));
  return r.rows[0]?.id ?? null;
}
export async function createOneTimeToken(userId: string, kind: "confirm" | "recovery", ttlMinutes: number): Promise<string> {
  const token = newToken();
  await asOwner(async (q) => {
    await q.query("delete from auth.one_time_tokens where user_id = $1 and kind = $2", [userId, kind]);
    await q.query("insert into auth.one_time_tokens (user_id, kind, token_hash, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))", [userId, kind, sha(token), ttlMinutes]);
  });
  return token;
}
/** Consomme un jeton (une seule fois, avant expiration). Renvoie l'utilisateur ou null. */
export async function consumeOneTimeToken(token: string, kind: "confirm" | "recovery"): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const r = await asOwner((q) => q.query(
    "update auth.one_time_tokens set used_at = now() where token_hash = $1 and kind = $2 and used_at is null and expires_at > now() returning user_id::text",
    [sha(token), kind]));
  return r.rows[0]?.user_id ?? null;
}

// ---------- second facteur (TOTP) ----------
export async function verifiedFactor(userId: string): Promise<string | null> {
  const r = await asOwner((q) => q.query("select id::text from auth.mfa_factors where user_id = $1 and status = 'verified' order by created_at limit 1", [userId]));
  return r.rows[0]?.id ?? null;
}
export async function countVerifiedFactors(userId: string): Promise<number> {
  const r = await asOwner((q) => q.query("select count(*)::int as n from auth.mfa_factors where user_id = $1 and status = 'verified'", [userId]));
  return r.rows[0].n;
}
/** Nouvelle inscription d'application (remplace une inscription non terminée). Refusée si un facteur vérifié existe déjà. */
export async function enrollFactor(userId: string, email: string): Promise<{ factorId: string; secret: string; uri: string } | null> {
  return asOwner(async (q) => {
    const v = await q.query("select 1 from auth.mfa_factors where user_id = $1 and status = 'verified'", [userId]);
    if (v.rows.length) return null;
    await q.query("delete from auth.mfa_factors where user_id = $1 and status = 'unverified'", [userId]);
    const secret = newSecret();
    const r = await q.query("insert into auth.mfa_factors (user_id, secret) values ($1, $2) returning id::text", [userId, secret]);
    return { factorId: r.rows[0].id as string, secret, uri: otpauthUri(secret, email) };
  });
}
/** Vérifie le code ; en cas de succès, le facteur devient vérifié et la session passe au niveau aal2. */
export async function verifyFactor(userId: string, factorId: string, code: string, sessionId: string): Promise<boolean> {
  return asOwner(async (q) => {
    const r = await q.query("select secret, last_used_step from auth.mfa_factors where id = $1 and user_id = $2 for update", [factorId, userId]);
    const f = r.rows[0];
    if (!f) return false;
    const step = verifyTotp(f.secret, code, f.last_used_step == null ? null : Number(f.last_used_step));
    if (step == null) return false;
    await q.query("update auth.mfa_factors set status = 'verified', last_used_step = $2 where id = $1", [factorId, step]);
    await q.query("update auth.sessions set aal = 'aal2' where id = $1 and user_id = $2", [sessionId, userId]);
    return true;
  });
}

/** Nettoyage périodique (tâches planifiées). */
export async function cleanupAuth(): Promise<void> {
  await asOwner(async (q) => {
    await q.query("delete from auth.sessions where expires_at < now()");
    await q.query("delete from auth.one_time_tokens where expires_at < now() - interval '1 day'");
    await q.query("delete from auth.failed_logins where at < now() - interval '1 day'");
  });
}
