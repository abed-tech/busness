"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, rpc } from "@/lib/auth";
import type { ActionState } from "@/components/ConfirmAction";

export async function setOrganizerStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("organizers.suspend");
  const id = String(fd.get("user_id") || "");
  const status = String(fd.get("status") || "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !["active", "suspended"].includes(status)) return { ok: false, message: "Requête invalide." };
  const r = await rpc("admin_set_organizer_status", { p_user: id, p_status: status, p_reason: String(fd.get("reason") || "").slice(0, 500) });
  revalidatePath(`/organizers/${id}`);
  revalidatePath("/organizers");
  return r.ok ? { ok: true, message: status === "suspended" ? "Compte suspendu." : "Compte réactivé." } : { ok: false, message: r.message };
}
