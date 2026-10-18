"use server";
import { cookies } from "next/headers";
import { anonClient } from "@/lib/data/server";
import { humanError } from "@/lib/auth";

const COOKIE = "ktok";
const valid = (short: string, staff: string) => /^[A-Za-z0-9]{4,20}$/.test(short) && /^[0-9a-f-]{36}$/.test(staff);
const path = (short: string, staff: string) => `/k/${short}/${staff}`;

async function token(short: string, staff: string) {
  if (!valid(short, staff)) return "";
  return (await cookies()).get(COOKIE)?.value || "";
}

export type KResult = { ok: boolean; message?: string; data?: Record<string, any>; expired?: boolean };

async function call(fn: string, args: Record<string, unknown>): Promise<KResult> {
  const sb = await anonClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, message: humanError(error.message, error.code), expired: error.code === "28000" };
  return { ok: true, data: data as Record<string, any> };
}

/** Connexion du contrôleur ou du serveur : vérifiée par la base (bcrypt, blocage après 5 essais). Jeton en cookie httpOnly. */
export async function kLogin(_: KResult | null, fd: FormData): Promise<KResult> {
  const short = String(fd.get("short")), staff = String(fd.get("staff"));
  if (!valid(short, staff)) return { ok: false, message: "Lien d’accès invalide." };
  const r = await call("staff_login", { p_event_short: short, p_staff: staff, p_code: String(fd.get("code") || "").slice(0, 12), p_password: String(fd.get("password") || "").slice(0, 64) });
  if (!r.ok) return r;
  if (!r.data?.ok) return { ok: false, message: r.data?.error || "Connexion refusée." };
  (await cookies()).set(COOKIE, r.data.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: path(short, staff), maxAge: Number(r.data.expires_in) || 43200 });
  return { ok: true };
}

export async function kLogout(short: string, staff: string): Promise<void> {
  const t = await token(short, staff);
  if (t) await call("staff_logout", { p_token: t });
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: path(short, staff), maxAge: 0 });
}

export async function kOverview(short: string, staff: string): Promise<KResult> {
  const t = await token(short, staff);
  if (!t) return { ok: false, expired: true };
  return call("staff_overview", { p_token: t });
}

export async function kLookup(short: string, staff: string, scan: string): Promise<KResult> {
  const t = await token(short, staff);
  if (!t) return { ok: false, expired: true, message: "Session expirée. Reconnectez-vous." };
  return call("staff_lookup", { p_token: t, p_scan: scan.trim().slice(0, 80) });
}

export async function kConfirm(short: string, staff: string, guest: string): Promise<KResult> {
  const t = await token(short, staff);
  if (!t) return { ok: false, expired: true, message: "Session expirée. Reconnectez-vous." };
  return call("staff_confirm_entry", { p_token: t, p_guest: guest });
}

export async function kServe(short: string, staff: string, guest: string, kind: "drink" | "dish"): Promise<KResult> {
  const t = await token(short, staff);
  if (!t) return { ok: false, expired: true, message: "Session expirée. Reconnectez-vous." };
  return call("staff_mark_served", { p_token: t, p_guest: guest, p_kind: kind });
}
