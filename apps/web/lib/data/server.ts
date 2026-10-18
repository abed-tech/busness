import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dataClient, auth, ANON, type Ctx } from "@ceremonia/server";

/** Cookie de session propre à l'espace organisateur (distinct de celui de l'admin). */
export const ORG_COOKIE = "cer-org";

/** Session de l'organisateur pour la requête en cours (lue une seule fois par requête). */
export const currentSession = cache(async () => {
  const token = (await cookies()).get(ORG_COOKIE)?.value;
  return auth.getSession(token, "org");
});

/**
 * Client de données côté serveur, avec l'identité de l'organisateur connecté (ou anonyme) :
 * chaque requête s'exécute avec le rôle « authenticated » ou « anon », soumise aux règles RLS de la base.
 */
export async function serverClient() {
  const s = await currentSession();
  const ctx: Ctx = s ? { role: "authenticated", claims: { sub: s.userId, email: s.email, aal: s.aal } } : ANON;
  return {
    ...dataClient(ctx),
    auth: {
      getUser: async () => ({ data: { user: s ? { id: s.userId, email: s.email, user_metadata: await auth.userMeta(s.userId) } : null } }),
      signOut: async () => { await endSession(); return { error: null }; },
    },
  };
}

/** Client anonyme (invités et personnel : aucune session, accès par jeton vérifié dans la base). */
export function anonClient() {
  return dataClient(ANON);
}

/** Ouvre une session organisateur et pose le cookie (httpOnly, Secure en production, SameSite=Lax). */
export async function startSession(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await auth.createSession(userId, "org", { ip: (h.get("x-forwarded-for") || "").split(",")[0].trim(), userAgent: h.get("user-agent") || "" });
  (await cookies()).set(ORG_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function endSession() {
  const store = await cookies();
  await auth.deleteSession(store.get(ORG_COOKIE)?.value);
  try { store.delete(ORG_COOKIE); } catch { /* composant serveur : la session est déjà supprimée en base */ }
}
