"use server";
import { revalidatePath } from "next/cache";
import { requireOrganizer, rpc } from "@/lib/auth";

/** Enregistre l'ouverture de WhatsApp pour ces invitations (refusé par la base si le règlement n'est pas fait). */
export async function markSent(eventId: string, guestIds: string[]): Promise<{ ok: boolean; message?: string }> {
  await requireOrganizer();
  const ids = guestIds.filter((g) => /^[0-9a-f-]{36}$/.test(g)).slice(0, 500);
  const r = await rpc("mark_invitations_sent", { p_event: eventId, p_guests: ids });
  revalidatePath(`/events/${eventId}`, "layout");
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}
