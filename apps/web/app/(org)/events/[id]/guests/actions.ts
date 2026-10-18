"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normPhone, parseGuests } from "@ceremonia/core";
import { requireOrganizer, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { insertGuests } from "@/lib/guests";
import type { ActionState } from "@/components/ConfirmAction";

async function prefixOf(eventId: string) {
  const sb = await serverClient();
  const { data } = await sb.from("events").select("phone_prefix").eq("id", eventId).maybeSingle();
  return data?.phone_prefix as string | undefined;
}

function one(fd: FormData, prefix: string): { ok: true; row: { name: string; kind: string; whatsapp: string } } | { ok: false; message: string } {
  const name = String(fd.get("name") || "").trim().slice(0, 120);
  const kind = String(fd.get("kind") || "");
  if (!name) return { ok: false, message: "Le nom est obligatoire." };
  if (!["mr", "mme", "couple"].includes(kind)) return { ok: false, message: "Choisissez le statut : Monsieur, Madame ou Couple." };
  const raw = String(fd.get("whatsapp") || "").trim();
  let whatsapp = "";
  if (raw) { const ph = normPhone(raw, prefix); if (!ph.ok) return { ok: false, message: ph.why }; whatsapp = ph.value; }
  return { ok: true, row: { name, kind, whatsapp } };
}

export async function addGuest(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const prefix = await prefixOf(id);
  if (!prefix) return { ok: false, message: "Événement introuvable." };
  const r = one(fd, prefix);
  if (!r.ok) return r;
  const ins = await insertGuests(id, [r.row]);
  if (!ins.ok) return ins;
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: `${r.row.name} ajouté(e).` };
}

export async function addGuestList(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const prefix = await prefixOf(id);
  if (!prefix) return { ok: false, message: "Événement introuvable." };
  const p = parseGuests(String(fd.get("list") || ""), prefix);
  if (!p.rows.length) return { ok: false, message: "Aucune ligne exploitable. Une invitation par ligne : Nom ; Statut ; WhatsApp." };
  if (p.rows.length > 1500) return { ok: false, message: "1 500 invitations au maximum par importation." };
  const ins = await insertGuests(id, p.rows.map((r) => ({ name: r.name, kind: r.kind || null, whatsapp: r.whatsapp })));
  if (!ins.ok) return ins;
  revalidatePath(`/events/${id}`, "layout");
  const todo = p.rows.filter((r) => !r.kind).length;
  return { ok: true, message: `${p.rows.length} invitation(s) ajoutée(s).${todo ? ` ${todo} statut(s) à préciser.` : ""}` };
}

export async function updateGuest(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), gid = String(fd.get("guest_id"));
  const prefix = await prefixOf(id);
  if (!prefix) return { ok: false, message: "Événement introuvable." };
  const r = one(fd, prefix);
  if (!r.ok) return r;
  const sb = await serverClient();
  const { error, count } = await sb.from("guests").update(r.row, { count: "exact" }).eq("id", gid).eq("event_id", id);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  if (!count) return { ok: false, message: "Modification refusée." };
  revalidatePath(`/events/${id}`, "layout");
  redirect(`/events/${id}/guests?saved=1`);
}

export async function deleteGuest(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), gid = String(fd.get("guest_id"));
  const sb = await serverClient();
  const { error, count } = await sb.from("guests").delete({ count: "exact" }).eq("id", gid).eq("event_id", id);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  if (!count) return { ok: false, message: "Suppression refusée." };
  revalidatePath(`/events/${id}`, "layout");
  redirect(`/events/${id}/guests?deleted=1`);
}
