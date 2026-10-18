"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizer, rpc } from "@/lib/auth";
import type { ActionState } from "@/components/ConfirmAction";

export type CreatedState = (ActionState & { created?: { id: string; code: string; name: string; password: string } }) | null;

export async function createStaff(_: CreatedState, fd: FormData): Promise<CreatedState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), role = String(fd.get("role"));
  const name = String(fd.get("name") || "").trim(), password = String(fd.get("password") || "");
  if (role !== "controller" && role !== "server") return { ok: false, message: "Rôle invalide." };
  if (!name) return { ok: false, message: "Indiquez un nom." };
  if (password.length < 6 || password.length > 64) return { ok: false, message: "Le mot de passe doit contenir entre 6 et 64 caractères." };
  const r = await rpc<{ id: string; access_code: string }>("create_staff", { p_event: id, p_role: role, p_name: name, p_password: password });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/events/${id}/staff/${role}`);
  // le mot de passe n'est renvoyé qu'une fois, à son auteur, pour être transmis ; il n'est jamais stocké en clair
  return { ok: true, created: { id: r.data.id, code: r.data.access_code, name, password } };
}

export async function setRevoked(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const r = await rpc("set_staff_revoked", { p_staff: String(fd.get("staff_id")), p_revoked: fd.get("revoked") === "1" });
  revalidatePath(`/events/${fd.get("event_id")}`, "layout");
  return r.ok ? { ok: true, message: fd.get("revoked") === "1" ? "Accès révoqué : la personne est déconnectée immédiatement." : "Accès rétabli." } : { ok: false, message: r.message };
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const pw = String(fd.get("password") || "");
  if (pw.length < 6 || pw.length > 64) return { ok: false, message: "Le mot de passe doit contenir entre 6 et 64 caractères." };
  const r = await rpc("reset_staff_password", { p_staff: String(fd.get("staff_id")), p_password: pw });
  return r.ok ? { ok: true, message: `Nouveau mot de passe enregistré : ${pw} — transmettez-le maintenant, il ne sera plus affiché.` } : { ok: false, message: r.message };
}

export async function deleteStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), role = String(fd.get("role"));
  const r = await rpc("delete_staff", { p_staff: String(fd.get("staff_id")) });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/events/${id}`, "layout");
  redirect(`/events/${id}/staff/${role}?deleted=1`);
}
