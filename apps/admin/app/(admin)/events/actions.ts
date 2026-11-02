"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, rpc } from "@/lib/auth";
import type { ActionState } from "@/components/ConfirmAction";

// L'administration ne modifie, ne supprime ni ne remplit aucun événement (invités, tables, accès) :
// la base le refuse à tout rôle (migration 20261102002000_admin_privacy.sql).

const EventSchema = z.object({
  type: z.enum(["mariage", "fiancailles", "anniversaire", "bapteme", "gala", "conference"]),
  host_a: z.string().max(80).default(""),
  host_b: z.string().max(80).default(""),
  title: z.string().trim().min(1, "Titre requis.").max(160),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  event_time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide."),
  venue: z.string().trim().min(1, "Lieu requis.").max(160),
  address: z.string().trim().min(1, "Adresse requise.").max(300),
  dress: z.string().max(160).default(""),
  message: z.string().max(2000).default(""),
  program: z.string().max(3000).default(""),
  expected: z.coerce.number().int().min(0).max(10000),
  table_capacity: z.coerce.number().int().min(1, "Places par table : 1 minimum.").max(100),
  offer: z.enum(["both", "drinks", "food", "none"]),
  phone_prefix: z.string().regex(/^\+\d{1,4}$/).default("+243"),
});
const lines = (v: FormDataEntryValue | null) => String(v || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 200);

/** Événement offert, créé pour le compte d'un organisateur : lui seul le gère ensuite (invités, tables, accès). */
export async function createEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.create");
  const organizer_id = String(fd.get("organizer_id") || "");
  if (!/^[0-9a-f-]{36}$/.test(organizer_id)) return { ok: false, message: "Sélectionnez l’organisateur concerné." };
  const parsed = EventSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Formulaire invalide." };
  const res = await rpc<{ id: string }>("admin_create_event", {
    p: { ...parsed.data, mode: "for_organizer", organizer_id, drinks: lines(fd.get("drinks")), dishes: lines(fd.get("dishes")) },
  });
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath("/events");
  redirect(`/events/${res.data.id}?created=1`);
}

export async function setStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.suspend");
  const id = String(fd.get("event_id"));
  const r = await rpc("admin_set_event_status", { p_event: id, p_status: String(fd.get("status")), p_reason: String(fd.get("reason") || "") });
  revalidatePath(`/events/${id}`);
  return r.ok ? { ok: true, message: "Statut mis à jour." } : { ok: false, message: r.message };
}

export async function searchOrganizers(q: string): Promise<{ id: string; username: string; email: string | null }[]> {
  await requireAdmin("events.create");
  const r = await rpc<{ items: { id: string; username: string; email: string | null; status: string }[] }>("admin_list_organizers", { p_search: q.slice(0, 80), p_status: "active", p_page: 1, p_size: 8 });
  return r.ok ? r.data.items.map(({ id, username, email }) => ({ id, username, email })) : [];
}
