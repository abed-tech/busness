"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, rpc, dataClient, SERVICE } from "@ceremonia/server";
import { startSession, endSession } from "@/lib/data/server";

export type AuthState = { message?: string } | null;

const LoginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(200) });

/** Connexion admin : limitation des tentatives (par e-mail et par adresse IP), puis second facteur obligatoire. */
export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = LoginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { message: "E-mail ou mot de passe invalide." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim();
  const { data: guard } = await rpc<{ allowed: boolean; retry_after_minutes: number }>(SERVICE, "admin_login_guard", { p_email: parsed.data.email, p_ip: ip });
  if (guard && guard.allowed === false) return { message: `Trop de tentatives. Réessayez dans ${guard.retry_after_minutes} minutes.` };

  // la limitation admin (ci-dessus, journalisée) remplace celle des organisateurs
  const r = await auth.checkPassword(parsed.data.email, parsed.data.password, { throttle: false });
  let isAdmin = false;
  if (r.ok) {
    const { data: a } = await dataClient({ role: "authenticated", claims: { sub: r.userId } }).from("admin_users").select("active").eq("user_id", r.userId).maybeSingle();
    isAdmin = !!a?.active;
  }
  await rpc(SERVICE, "admin_login_record", { p_email: parsed.data.email, p_ip: ip, p_success: isAdmin });
  // message identique : ne révèle pas si le compte existe ni s'il s'agit d'un organisateur
  if (!isAdmin || !r.ok) return { message: "E-mail ou mot de passe incorrect." };
  await startSession(r.userId);
  redirect("/mfa");
}

export async function logout() {
  await endSession(true);
  redirect("/login");
}
