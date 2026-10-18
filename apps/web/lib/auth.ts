import "server-only";
import { redirect } from "next/navigation";
import { serverClient } from "./data/server";

export interface Organizer {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  status: "active" | "suspended";
  status_reason: string | null;
}

/**
 * Exige un organisateur connecté avec un profil. Un compte administrateur est refusé ici :
 * l'administration a son propre domaine et ses propres comptes.
 */
export async function requireOrganizer(): Promise<Organizer> {
  const sb = await serverClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/login");
  const { data: adm } = await sb.from("admin_users").select("user_id").eq("user_id", u.user.id).maybeSingle();
  if (adm) {
    await sb.auth.signOut();
    redirect("/login?e=admin");
  }
  const { data: p } = await sb.from("profiles").select("id, username, full_name, phone, status, status_reason").eq("id", u.user.id).maybeSingle();
  if (!p) redirect("/onboarding");
  return { ...p, email: u.user.email || "" } as Organizer;
}

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export function humanError(msg: string, code?: string): string {
  if (code === "42501") return /Réglez|disponible|refusé|validée/.test(msg) ? msg : "Action non autorisée pour ce compte ou cet événement.";
  if (code === "23514" || code === "22023" || code === "P0002" || code === "28000") return msg;
  if (code === "23505") return "Cet élément existe déjà.";
  if (/fetch|network/i.test(msg)) return "Connexion au serveur impossible. Rien n’a été enregistré : réessayez.";
  return "Une erreur est survenue. Réessayez.";
}

/** Appel d'une fonction de la base avec la session de l'organisateur. */
export async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  const sb = await serverClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  return { ok: true, data: data as T };
}

export function origin(): string {
  return (process.env.ORGANIZER_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}
