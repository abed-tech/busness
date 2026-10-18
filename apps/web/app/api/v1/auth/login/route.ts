import { auth } from "@ceremonia/server";
import { json, apiError, hostAllowed, isAdminAccount } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST /api/v1/auth/login  { "email", "password" } → 201 { token, expires_at, user } (organisateurs uniquement). */
export async function POST(req: Request) {
  if (!hostAllowed(req)) return new Response("Not found", { status: 404 });
  let b: { email?: unknown; password?: unknown };
  try { b = await req.json(); } catch { return apiError(400, "bad_request", "Corps JSON attendu."); }
  const email = typeof b.email === "string" ? b.email.trim().slice(0, 254) : "", password = typeof b.password === "string" ? b.password.slice(0, 200) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return apiError(400, "bad_request", "E-mail et mot de passe requis.");
  const r = await auth.checkPassword(email, password);
  if (!r.ok) return r.error === "rate_limited" ? apiError(429, "rate_limited", "Trop de tentatives. Patientez quelques minutes.") : apiError(401, "invalid_credentials", "E-mail ou mot de passe incorrect.");
  if (!r.confirmed) return apiError(403, "email_not_confirmed", "Confirmez d’abord votre adresse e-mail.");
  if (await isAdminAccount(r.userId)) return apiError(403, "forbidden", "Ce compte ne peut pas se connecter ici.");
  const s = await auth.createSession(r.userId, "org", { ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim(), userAgent: req.headers.get("user-agent") || "api" });
  return json({ token: s.token, expires_at: s.expiresAt.toISOString(), user: { id: r.userId, email: email.toLowerCase() } }, 201);
}
