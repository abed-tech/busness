import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { serverClient, ADMIN_COOKIE } from "./data/server";
import type { AdminRole, Perm } from "./perms";

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
  perms: Set<Perm>;
}

/**
 * Exige un administrateur actif ayant validé son second facteur (aal2).
 * Les permissions sont lues dans la base (role_permissions) ; la base les revérifie à chaque appel.
 */
export async function requireAdmin(perm?: Perm): Promise<AdminSession> {
  const sb = await serverClient();
  const { data: u } = await sb.auth.getUser();
  // cookie présent mais session refusée par la base : inactivité ou expiration
  if (!u.user) redirect((await cookies()).get(ADMIN_COOKIE)?.value ? "/login?e=idle" : "/login");
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/mfa");
  const { data: admin } = await sb.from("admin_users").select("role, display_name, active").eq("user_id", u.user.id).maybeSingle();
  if (!admin || !admin.active) {
    await sb.auth.signOut();
    redirect("/login?e=denied");
  }
  const { data: rows } = await sb.from("role_permissions").select("perm").eq("role", admin.role);
  const perms = new Set<Perm>((rows || []).map((r: { perm: string }) => r.perm as Perm));
  if (perm && !perms.has(perm)) redirect("/?e=forbidden");
  return { userId: u.user.id, email: u.user.email || "", name: admin.display_name, role: admin.role as AdminRole, perms };
}

export type RpcResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Appel d'une fonction de la base ; traduit les refus et erreurs en messages lisibles. */
export async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  const sb = await serverClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  const d = data as { ok?: boolean; error?: string; message?: string } | null;
  if (d && d.ok === false) return { ok: false, message: d.message || (d.error === "forbidden" ? "Action non autorisée pour votre rôle." : d.error === "not_found" ? "Élément introuvable." : "Opération refusée.") };
  return { ok: true, data: data as T };
}

export function humanError(msg: string, code?: string): string {
  if (code === "42501") return "Action non autorisée.";
  if (code === "23514" || code === "22023" || code === "P0002") return msg;
  if (/fetch|network/i.test(msg)) return "Connexion au serveur impossible. Réessayez.";
  return "Une erreur est survenue. Réessayez ou consultez le journal.";
}
