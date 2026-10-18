"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { autoAssign, parseGuests, normPhone, type Guest } from "@ceremonia/core";
import { requireAdmin, rpc, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import type { ActionState } from "@/components/ConfirmAction";

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

export async function createEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.create");
  const mode = String(fd.get("mode"));
  const organizer_id = String(fd.get("organizer_id") || "");
  if (mode !== "platform" && mode !== "for_organizer") return { ok: false, message: "Choisissez le mode de création." };
  if (mode === "for_organizer" && !/^[0-9a-f-]{36}$/.test(organizer_id)) return { ok: false, message: "Sélectionnez l’organisateur concerné." };
  const parsed = EventSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Formulaire invalide." };
  const guestsText = String(fd.get("guests") || "");
  const g = guestsText.trim() ? parseGuests(guestsText, parsed.data.phone_prefix) : { rows: [], issues: [] };
  if (g.rows.length > 1500) return { ok: false, message: "1 500 invitations au maximum par importation." };
  const res = await rpc<{ id: string }>("admin_create_event", {
    p: { ...parsed.data, mode, organizer_id: mode === "for_organizer" ? organizer_id : null, organizer_can_manage: fd.get("organizer_can_manage") === "on", drinks: lines(fd.get("drinks")), dishes: lines(fd.get("dishes")) },
  });
  if (!res.ok) return { ok: false, message: res.message };
  const id = res.data.id;
  if (g.rows.length) {
    const ins = await insertGuests(id, g.rows.map((r) => ({ name: r.name, kind: r.kind || null, whatsapp: r.whatsapp })));
    if (!ins.ok) return { ok: false, message: `Événement créé, mais les invités n’ont pas pu être enregistrés : ${ins.message}` };
    if (fd.get("auto") === "on") await runAutoAssign(id, false);
  }
  revalidatePath("/events");
  redirect(`/events/${id}?created=1`);
}

async function insertGuests(eventId: string, rows: { name: string; kind: string | null; whatsapp: string }[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = await serverClient();
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("guests").insert(rows.slice(i, i + 200).map((r) => ({ event_id: eventId, ...r })));
    if (error) return { ok: false, message: humanError(error.message, error.code) };
  }
  return { ok: true };
}

export async function addGuests(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.write");
  const eventId = String(fd.get("event_id"));
  const sb = await serverClient();
  const { data: ev } = await sb.from("events").select("phone_prefix").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false, message: "Événement introuvable." };
  const single = String(fd.get("name") || "").trim();
  let rows: { name: string; kind: string | null; whatsapp: string }[];
  if (single) {
    const kind = String(fd.get("kind") || "");
    if (!["mr", "mme", "couple"].includes(kind)) return { ok: false, message: "Choisissez le statut : Monsieur, Madame ou Couple." };
    const ph = normPhone(fd.get("whatsapp"), ev.phone_prefix);
    if (!ph.ok) return { ok: false, message: ph.why };
    rows = [{ name: single.slice(0, 120), kind, whatsapp: ph.value }];
  } else {
    const p = parseGuests(String(fd.get("list") || ""), ev.phone_prefix);
    if (!p.rows.length) return { ok: false, message: "Aucune ligne exploitable." };
    if (p.rows.length > 1500) return { ok: false, message: "1 500 invitations au maximum." };
    rows = p.rows.map((r) => ({ name: r.name, kind: r.kind || null, whatsapp: r.whatsapp }));
  }
  const r = await insertGuests(eventId, rows);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: `${rows.length} invitation(s) ajoutée(s).` };
}

async function runAutoAssign(eventId: string, keep: boolean): Promise<ActionState> {
  const sb = await serverClient();
  const [{ data: ev }, { data: guests }] = await Promise.all([
    sb.from("events").select("table_capacity, expected, extra_tables").eq("id", eventId).maybeSingle(),
    sb.from("guests").select("id, name, kind, table_no, placed_manually").eq("event_id", eventId),
  ]);
  if (!ev || !guests) return { ok: false, message: "Événement introuvable." };
  const res = autoAssign(ev, guests as Guest[], { keep, strategy: "fill" });
  if (!res.ok) return { ok: false, message: res.errors.join(" ") };
  const { error } = await sb.rpc("save_table_plan", { p_event: eventId, p_plan: res.plan, p_manual: false, p_label: "Attribution automatique (administration)" });
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  return { ok: true, message: `${res.placed} invitation(s) placée(s), couples ensemble, aucune table dépassée.` };
}

export async function autoAssignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.write");
  const id = String(fd.get("event_id"));
  const r = await runAutoAssign(id, fd.get("keep") === "on");
  revalidatePath(`/events/${id}`);
  return r;
}

export async function setStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.suspend");
  const id = String(fd.get("event_id"));
  const r = await rpc("admin_set_event_status", { p_event: id, p_status: String(fd.get("status")), p_reason: String(fd.get("reason") || "") });
  revalidatePath(`/events/${id}`);
  return r.ok ? { ok: true, message: "Statut mis à jour." } : { ok: false, message: r.message };
}

export async function deleteEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.delete");
  const r = await rpc("admin_delete_event", { p_event: String(fd.get("event_id")), p_confirm_title: String(fd.get("confirm") || "") });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/events");
  redirect("/events?deleted=1");
}

export async function updateEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("events.write");
  const id = String(fd.get("event_id"));
  const parsed = EventSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Formulaire invalide." };
  const r = await rpc("admin_update_event", { p_event: id, p: parsed.data });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(`/events/${id}`);
  redirect(`/events/${id}?updated=1`);
}

export async function searchOrganizers(q: string): Promise<{ id: string; username: string; email: string | null }[]> {
  await requireAdmin("events.create");
  const r = await rpc<{ items: { id: string; username: string; email: string | null; status: string }[] }>("admin_list_organizers", { p_search: q.slice(0, 80), p_status: "active", p_page: 1, p_size: 8 });
  return r.ok ? r.data.items.map(({ id, username, email }) => ({ id, username, email })) : [];
}
