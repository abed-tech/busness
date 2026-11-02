import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { dataClient, auth, ANON, type Ctx } from "@ceremonia/server";

/** Cookie de session propre à l'espace organisateur (distinct de celui de l'admin). */
export const ORG_COOKIE = "cer-org";

/**
 * Délais de retour, mesurés par la base depuis la dernière activité réelle (jamais par le navigateur) :
 * moins de 10 min → même page ; de 10 à moins de 30 min → « Mes événements » ; 30 min ou plus → session fermée,
 * mot de passe exigé.
 */
export const RETURN_MINUTES = 10;
export const IDLE_MINUTES = 30;
const HOME = "/events";
const ORG_PAGE = /^\/(events|profile|preview)(\/|\?|$)/;
const KEEP_PAGE = /^\/events\/[^/]+\/pay\//; // retour d'un paiement externe : la page confirme le règlement

/** Page de l'espace organisateur que l'on peut rouvrir (chemin interne uniquement : jamais un autre site). */
export function orgPath(p: unknown): string | null {
  return typeof p === "string" && p.length <= 500 && ORG_PAGE.test(p) ? p : null;
}

/**
 * Session de l'organisateur pour la requête en cours (lue une seule fois par requête). La lecture seule ne compte
 * pas comme une activité : c'est trackNavigation qui l'enregistre, pour les pages et les actions.
 */
export const currentSession = cache(async () => {
  const token = (await cookies()).get(ORG_COOKIE)?.value;
  return auth.getSession(token, "org", IDLE_MINUTES, { touch: false });
});

/** Vrai si le navigateur présente un cookie de session (valide ou non). */
export async function hasSessionCookie(): Promise<boolean> {
  return !!(await cookies()).get(ORG_COOKIE)?.value;
}

/**
 * Applique les règles de retour à la page demandée et enregistre l'activité (une fois par requête).
 * - préchargement de lien : rien (ce n'est pas une activité) ;
 * - action (formulaire envoyé) : activité enregistrée, jamais de redirection (la saisie n'est pas perdue) ;
 * - page : à partir de 10 min d'absence, retour sur « Mes événements » ; sinon la page reste affichée et devient
 *   la dernière page consultée. Une actualisation est une requête comme une autre : même page si moins de 10 min.
 * - premier affichage après la réouverture du navigateur (cookie cer-nav absent) sur « Mes événements » :
 *   dernière page consultée rouverte si l'absence est inférieure à 10 min.
 */
export const trackNavigation = cache(async () => {
  const s = await currentSession();
  if (!s) return;
  const h = await headers();
  if (h.get("next-router-prefetch")) return;
  if (h.get("next-action")) { if (s.idleSeconds >= 60) await auth.touchSession(s.sessionId); return; }
  const url = h.get("x-skyevenapp-url") || "";
  if (s.idleSeconds >= RETURN_MINUTES * 60 && !KEEP_PAGE.test(url)) {
    await auth.touchSession(s.sessionId);
    if (url.split("?")[0] !== HOME) redirect(HOME);
    return;
  }
  if (h.get("x-skyevenapp-fresh") && url === HOME && s.lastPath && s.lastPath !== HOME) {
    await auth.touchSession(s.sessionId);
    redirect(s.lastPath);
  }
  const path = orgPath(url);
  if (s.idleSeconds >= 60 || (path && path !== s.lastPath)) await auth.touchSession(s.sessionId, path);
});

/**
 * Point d'entrée (accueil du site, page de connexion) avec une session ouverte : dernière page consultée après la
 * réouverture du navigateur si l'absence est inférieure à 10 min, sinon « Mes événements ». Sans session valide mais
 * avec un ancien cookie : connexion exigée (/auth/idle efface le cookie et affiche la connexion).
 */
export async function resumeOrLogin(stale: "login" | "stay"): Promise<void> {
  const s = await currentSession();
  if (!s) {
    if (stale === "login" && (await hasSessionCookie())) redirect("/auth/idle");
    return;
  }
  const fresh = !!(await headers()).get("x-skyevenapp-fresh");
  redirect(fresh && s.idleSeconds < RETURN_MINUTES * 60 && s.lastPath ? s.lastPath : HOME);
}

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
  const { token, expiresAt } = await auth.createSession(userId, "org", { ip: auth.clientIp(h), userAgent: h.get("user-agent") || "" });
  (await cookies()).set(ORG_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
}

export async function endSession() {
  const store = await cookies();
  await auth.deleteSession(store.get(ORG_COOKIE)?.value);
  try { store.delete(ORG_COOKIE); } catch { /* composant serveur : la session est déjà supprimée en base */ }
}
