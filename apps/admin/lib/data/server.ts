import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dataClient, auth, ANON, type Ctx } from "@ceremonia/server";

/** Cookie de session propre à l'espace admin : jamais partagé avec l'espace organisateur, même en local. */
export const ADMIN_COOKIE = "cer-adm";
const idle = () => Number(process.env.ADMIN_IDLE_MINUTES || 30);

/** Session admin de la requête en cours (expirée après ADMIN_IDLE_MINUTES d'inactivité, 12 h au plus). */
export const currentSession = cache(async () => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return auth.getSession(token, "admin", idle());
});

/**
 * Client de données côté serveur, avec l'identité de l'administrateur connecté (rôle « authenticated » + niveau aal) :
 * la base revérifie chaque permission (private.has_perm exige un admin actif ET le second facteur validé).
 */
export async function serverClient() {
  const s = await currentSession();
  const ctx: Ctx = s ? { role: "authenticated", claims: { sub: s.userId, email: s.email, aal: s.aal } } : ANON;
  return {
    ...dataClient(ctx),
    auth: {
      getUser: async () => ({ data: { user: s ? { id: s.userId, email: s.email } : null } }),
      signOut: async () => { await endSession(); return { error: null }; },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: s?.aal ?? null } }),
        listFactors: async () => {
          const n = s ? await auth.countVerifiedFactors(s.userId) : 0;
          return { data: { totp: Array.from({ length: n }, () => ({ status: "verified" })) } };
        },
      },
    },
  };
}

export async function startSession(userId: string) {
  const h = await headers();
  const { token } = await auth.createSession(userId, "admin", { ip: (h.get("x-forwarded-for") || "").split(",")[0].trim(), userAgent: h.get("user-agent") || "" });
  // cookie de session (sans date d'expiration) : fermé avec le navigateur ; la base limite aussi la durée et l'inactivité
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
}

/** Déconnexion ; « everywhere » ferme toutes les sessions admin de ce compte. */
export async function endSession(everywhere = false) {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (everywhere) { const s = await auth.getSession(token, "admin"); if (s) await auth.deleteUserSessions(s.userId, "admin"); }
  await auth.deleteSession(token);
  try { store.delete(ADMIN_COOKIE); store.delete("adm_last"); } catch { /* composant serveur */ }
}
