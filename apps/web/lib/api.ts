import "server-only";
import { auth, dataClient, ANON, type Ctx } from "@ceremonia/server";

/**
 * API REST v1 (applications mobiles Android / iOS et clients externes).
 * Authentification : « Authorization: Bearer <jeton> », jeton obtenu par POST /api/v1/auth/login
 * (même session qu'un navigateur, révocable, expirant après 30 jours).
 * Chaque opération est revérifiée par la base (rôles, RLS, fonctions SECURITY DEFINER) avec l'identité du jeton :
 * l'API ne détient aucun droit propre.
 * Pas de CORS : les applications natives n'en ont pas besoin, et aucun site tiers n'est autorisé.
 */
export type ApiUser = { id: string; email: string; token: string; ctx: Ctx };

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...NO_STORE, "Content-Type": "application/json; charset=utf-8" } });
}
export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

/** En production, l'API n'est servie que sur le domaine organisateur (jamais sur le domaine admin). */
export function hostAllowed(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const org = process.env.ORGANIZER_ORIGIN ? new URL(process.env.ORGANIZER_ORIGIN).host : null;
  const adm = process.env.ADMIN_ORIGIN ? new URL(process.env.ADMIN_ORIGIN).host : null;
  const host = req.headers.get("host"); // même règle que middleware.ts
  return !!org && host === org && host !== adm;
}

export function bearer(req: Request): string | null {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") || "");
  return m ? m[1] : null;
}

export async function isAdminAccount(userId: string): Promise<boolean> {
  const { data } = await dataClient({ role: "authenticated", claims: { sub: userId } }).from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

/** Exige un organisateur authentifié (jamais un compte admin). Renvoie l'utilisateur, ou une réponse d'erreur. */
export async function requireApiOrganizer(req: Request): Promise<ApiUser | Response> {
  if (!hostAllowed(req)) return new Response("Not found", { status: 404 });
  const token = bearer(req);
  if (!token) return apiError(401, "unauthorized", "Jeton d’accès manquant ou mal formé.");
  let s;
  try { s = await auth.getSession(token, "org"); } catch { return apiError(503, "db_unavailable", "Service momentanément indisponible. Réessayez."); }
  if (!s) return apiError(401, "unauthorized", "Session expirée ou invalide.");
  if (await isAdminAccount(s.userId)) return apiError(403, "forbidden", "Un compte administrateur n’utilise pas l’API organisateur.");
  return { id: s.userId, email: s.email, token, ctx: { role: "authenticated", claims: { sub: s.userId, email: s.email, aal: s.aal } } };
}

/** Identité facultative : organisateur si un jeton valide est fourni, sinon anonyme (invités, personnel). */
export async function optionalApiCtx(req: Request): Promise<Ctx | Response> {
  if (!hostAllowed(req)) return new Response("Not found", { status: 404 });
  if (!req.headers.get("authorization")) return ANON;
  const u = await requireApiOrganizer(req);
  return u instanceof Response ? u : u.ctx;
}

/** Traduit une erreur de la base en réponse HTTP. */
export function dbErrorResponse(e: { code?: string; message?: string }): Response {
  const status = e.code === "42501" ? 403 : e.code === "22023" || e.code === "23514" || e.code === "22P02" || e.code === "23502" ? 400 : e.code === "P0002" ? 404 : e.code === "23505" ? 409 : e.code === "PGRST116" ? 404 : e.code === "NETWORK" ? 503 : 400;
  const message = status === 503 ? "Base de données indisponible. Réessayez." : e.message || "Opération refusée.";
  return apiError(status, e.code || "error", message);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fonctions de la base accessibles par POST /api/v1/rpc/{nom}. Chacune revérifie elle-même les droits
 * (jeton d'invitation, session du personnel ou organisateur propriétaire). Aucune fonction d'administration.
 */
export const RPC_ALLOWLIST = new Set([
  // organisateur (jeton requis)
  "event_billing", "event_stats", "service_totals", "save_table_plan", "create_staff", "set_staff_revoked", "reset_staff_password",
  "delete_staff", "mark_invitations_sent", "rotate_service_key",
  // invité (jeton d'invitation)
  "get_invitation", "submit_rsvp",
  // contrôleurs et serveurs (session du personnel)
  "staff_login", "staff_lookup", "staff_confirm_entry", "staff_mark_served", "staff_overview", "staff_logout",
  // public
  "public_pricing", "service_board",
]);
