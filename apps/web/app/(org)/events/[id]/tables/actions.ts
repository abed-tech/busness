"use server";
import { revalidatePath } from "next/cache";
import { checkMoves, tableCount, type Guest, type Plan } from "@ceremonia/core";
import { requireOrganizer, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { runAutoAssign } from "@/lib/guests";
import type { ActionState } from "@/components/ConfirmAction";

async function ctx(eventId: string) {
  const sb = await serverClient();
  const [{ data: ev }, { data: guests }] = await Promise.all([
    sb.from("events").select("table_capacity, expected, extra_tables").eq("id", eventId).maybeSingle(),
    sb.from("guests").select("id, name, kind, table_no, placed_manually").eq("event_id", eventId),
  ]);
  return { sb, ev, guests: (guests || []) as Guest[] };
}

async function save(eventId: string, plan: Plan, label: string): Promise<ActionState> {
  const { sb, ev, guests } = await ctx(eventId);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  const errs = checkMoves(ev, guests, plan);
  if (errs.length) return { ok: false, message: errs.join(" ") };
  const { error } = await sb.rpc("save_table_plan", { p_event: eventId, p_plan: plan, p_manual: true, p_label: label });
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true, message: label };
}

export async function autoAssignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const r = await runAutoAssign(id, fd.get("keep") === "on", fd.get("strategy") === "balance" ? "balance" : "fill");
  revalidatePath(`/events/${id}`, "layout");
  return r;
}

export async function moveGuest(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), gid = String(fd.get("guest_id"));
  const t = Number(fd.get("table"));
  if (!Number.isInteger(t) || t < 0) return { ok: false, message: "Table invalide." };
  return save(id, { [gid]: t }, t ? `Invité placé à la table ${t}` : "Invité retiré de sa table");
}

export async function swapGuests(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), a = String(fd.get("a")), b = String(fd.get("b"));
  if (!a || !b || a === b) return { ok: false, message: "Choisissez deux invités différents." };
  const { guests } = await ctx(id);
  const ga = guests.find((g) => g.id === a), gb = guests.find((g) => g.id === b);
  if (!ga || !gb) return { ok: false, message: "Invité introuvable." };
  return save(id, { [a]: gb.table_no || 0, [b]: ga.table_no || 0 }, `Échange de places : ${ga.name} ⇄ ${gb.name}`);
}

export async function changeTables(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const delta = fd.get("op") === "add" ? 1 : -1;
  const { sb, ev, guests } = await ctx(id);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  const next = ev.extra_tables + delta;
  if (next < 0) return { ok: false, message: "Seules les tables ajoutées peuvent être retirées. Pour moins de tables, réduisez les personnes attendues ou augmentez les places par table." };
  const tc = tableCount({ ...ev, extra_tables: next }, guests);
  const blocked = guests.find((g) => (g.table_no || 0) > tc);
  if (blocked) return { ok: false, message: `La table ${blocked.table_no} n’est pas vide : déplacez d’abord ses invités.` };
  const { error, count } = await sb.from("events").update({ extra_tables: next }, { count: "exact" }).eq("id", id);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  if (!count) return { ok: false, message: "Modification refusée." };
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: delta > 0 ? "Table ajoutée." : "Table retirée." };
}
