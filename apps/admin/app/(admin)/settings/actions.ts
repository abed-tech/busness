"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, rpc } from "@/lib/auth";
import type { ActionState } from "@/components/ConfirmAction";

const done = (r: { ok: boolean; message?: string }, ok: string): ActionState => {
  revalidatePath("/settings");
  return r.ok ? { ok: true, message: ok } : { ok: false, message: (r as { message: string }).message };
};

export async function saveRetention(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("settings.write");
  const p = z.object({ days: z.coerce.number().int().min(1).max(3650), from: z.enum(["creation", "event_date"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, message: "Durée : 1 à 3 650 jours." };
  return done(await rpc("admin_update_setting", { p_key: "retention", p_value: { enabled: fd.get("enabled") === "on", days: p.data.days, from: p.data.from } }), "Règle de conservation enregistrée.");
}

export async function savePricing(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("settings.write");
  const p = z.object({ price: z.coerce.number().positive().max(10000), unit_persons: z.coerce.number().int().min(1).max(10000), currency: z.enum(["USD", "CDF", "EUR"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, message: "Tarif invalide." };
  return done(await rpc("admin_update_setting", { p_key: "pricing", p_value: { currency: p.data.currency, unit_cents: Math.round(p.data.price * 100), unit_persons: p.data.unit_persons } }), "Tarif enregistré. Il s’applique aux prochains paiements uniquement.");
}

export async function saveStaffLimits(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("settings.write");
  const p = z.object({ max_controllers: z.coerce.number().int().min(0).max(200), max_servers: z.coerce.number().int().min(0).max(500) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, message: "Limites invalides." };
  return done(await rpc("admin_update_setting", { p_key: "staff_limits", p_value: p.data }), "Limites enregistrées.");
}

export async function grantAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("admins.manage");
  const p = z.object({ email: z.string().trim().email().max(254), role: z.enum(["super", "moderator", "manager"]), name: z.string().trim().min(2).max(80) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, message: "E-mail, rôle et nom (2 à 80 caractères) requis." };
  return done(await rpc("admin_grant_by_email", { p_email: p.data.email, p_role: p.data.role, p_name: p.data.name, p_active: true }), "Rôle attribué. La personne devra activer son second facteur à sa première connexion.");
}

export async function updateAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("admins.manage");
  const p = z.object({ user_id: z.string().uuid(), role: z.enum(["super", "moderator", "manager"]), name: z.string().trim().min(2).max(80), active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, message: "Requête invalide." };
  return done(await rpc("admin_set_role", { p_user: p.data.user_id, p_role: p.data.role, p_active: p.data.active === "true", p_name: p.data.name }), p.data.active === "true" ? "Administrateur mis à jour." : "Accès désactivé.");
}
