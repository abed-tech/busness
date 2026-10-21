"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkMoves, planSeating, tableCount, type Guest, type Plan } from "@ceremonia/core";
import { requireOrganizer, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { runAutoAssign } from "@/lib/guests";
import type { ActionState } from "@/components/ConfirmAction";

async function ctx(eventId: string) {
  const sb = await serverClient();
  const [{ data: ev }, { data: guests }] = await Promise.all([
    sb.from("events").select("table_capacity, expected, extra_tables").eq("id", eventId).maybeSingle(),
    sb.from("guests").select("id, name, kind, table_no, placed_manually").eq("event_id", eventId).order("sort_order").order("created_at").order("id"), // ordre stable : l'aperçu et la confirmation donnent le même plan
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

export type SeatingPreview = {
  ok: boolean; message?: string;
  plan?: Plan; placed?: number; kept?: number; mixedTables?: number; unknownKind?: number; problems?: string[]; cap?: number;
  tables?: { n: number; used: number; mixed: boolean; guests: { id: string; name: string; couple: boolean; kept: boolean }[] }[];
  unplaced?: { id: string; name: string; couple: boolean }[];
};

/** Aperçu du placement automatique : calculé sur les données réelles, rien n'est enregistré. */
export async function previewSeating(eventId: string, keep: boolean): Promise<SeatingPreview> {
  await requireOrganizer();
  const { ev, guests } = await ctx(eventId);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  if (!guests.length) return { ok: false, message: "Aucun invité à placer." };
  const r = planSeating(ev, guests, { keep });
  return {
    ok: true, plan: r.plan, placed: r.placed, kept: r.kept, mixedTables: r.mixedTables, unknownKind: r.unknownKind, problems: r.problems, cap: ev.table_capacity,
    tables: r.tables.map((t) => ({ n: t.n, used: t.used, mixed: t.mixed, guests: t.guests.map((g) => ({ id: g.id, name: g.name, couple: g.kind === "couple", kept: !(g.id in r.plan) })) })),
    unplaced: r.unplaced.map((g) => ({ id: g.id, name: g.name, couple: g.kind === "couple" })),
  };
}

/** Confirmation : recalcul sur les données du moment ; si elles ont changé depuis l'aperçu, rien n'est enregistré. */
export async function confirmSeating(eventId: string, keep: boolean, shown: Plan): Promise<ActionState> {
  await requireOrganizer();
  const { sb, ev, guests } = await ctx(eventId);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  const r = planSeating(ev, guests, { keep });
  const same = Object.keys(r.plan).length === Object.keys(shown || {}).length && Object.entries(r.plan).every(([k, v]) => shown[k] === v);
  if (!same) return { ok: false, message: "Les invités ou les tables ont changé depuis l’aperçu : recalculez la répartition avant de confirmer." };
  const errs = checkMoves(ev, guests, r.plan);
  if (errs.length) return { ok: false, message: errs.join(" ") };
  if (!Object.keys(r.plan).length) return { ok: true, message: "Rien à modifier : tout le monde est déjà placé." };
  const { error } = await sb.rpc("save_table_plan", { p_event: eventId, p_plan: r.plan, p_manual: false, p_label: `Placement automatique : ${r.placed} invitation(s) placée(s)${r.unplaced.length ? `, ${r.unplaced.length} sans place` : ""}` });
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  revalidatePath(`/events/${eventId}`, "layout");
  return { ok: true, message: `${r.placed} invitation(s) placée(s).${r.unplaced.length ? ` ${r.unplaced.length} restent sans place : voir « Sans table ».` : " Tout le monde a une place."}` };
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

const UUID = /^[0-9a-f-]{36}$/;
const base = (id: string) => `/events/${id}/tables`;

/**
 * Placement automatique (page dédiée) : seuls les invités sans table (ou sur une table qui n'existe plus) sont placés,
 * les placements existants sont conservés ; couples ensemble, personnes seules regroupées, capacité respectée.
 * Enregistré en base (save_table_plan, capacité revérifiée sous verrou), puis ouverture de la page des résultats.
 */
export async function autoPlace(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  if (!UUID.test(id)) return { ok: false, message: "Événement introuvable." };
  const { sb, ev, guests } = await ctx(id);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  if (!guests.length) return { ok: false, message: "Aucun invité à placer : ajoutez d’abord des invités." };
  const r = planSeating(ev, guests, { keep: true });
  if (Object.keys(r.plan).length) {
    const errs = checkMoves(ev, guests, r.plan);
    if (errs.length) return { ok: false, message: errs.join(" ") };
    const { error } = await sb.rpc("save_table_plan", { p_event: id, p_plan: r.plan, p_manual: false, p_label: `Placement automatique : ${r.placed} invitation(s) placée(s)${r.unplaced.length ? `, ${r.unplaced.length} sans place` : ""}` });
    if (error) return { ok: false, message: `Le placement n’a pas été enregistré : ${humanError(error.message, error.code)}` };
  }
  revalidatePath(`/events/${id}`, "layout");
  redirect(`${base(id)}/auto/resultat?placed=${r.placed}`);
}

/**
 * Placement manuel d'un invité à une table (mode « place » : invité sans table) ou déplacement seul (mode « move »).
 * Vérifié sur les données du moment : invité de l'événement, pas déjà placé (mode place), table existante avec assez de places.
 */
export async function placeGuest(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), gid = String(fd.get("guest_id")), move = fd.get("mode") === "move";
  const t = Number(fd.get("table"));
  if (!UUID.test(id) || !UUID.test(gid)) return { ok: false, message: "Invité introuvable." };
  if (!Number.isInteger(t) || t < 1) return { ok: false, message: "Table invalide." };
  const { sb, ev, guests } = await ctx(id);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  const g = guests.find((x) => x.id === gid);
  if (!g) return { ok: false, message: "Cet invité n’appartient pas à cet événement." };
  if (!move && g.table_no) return { ok: false, message: `${g.name} est déjà placé(e) à la table ${g.table_no}.` };
  if (g.table_no === t) return { ok: false, message: `${g.name} est déjà à la table ${t}.` };
  const errs = checkMoves(ev, guests, { [gid]: t });
  if (errs.length) return { ok: false, message: `La table ${t} n’a plus assez de places pour ${g.name} (elle vient peut-être d’être complétée). Choisissez une autre table.` };
  const { error } = await sb.rpc("save_table_plan", { p_event: id, p_plan: { [gid]: t }, p_manual: true, p_label: `${g.name} placé(e) à la table ${t}` });
  if (error) {
    return { ok: false, message: error.code === "23514"
      ? `La table ${t} n’a plus assez de places pour ${g.name} (elle vient d’être complétée). Choisissez une autre table.`
      : `Le placement n’a pas été enregistré : ${humanError(error.message, error.code)}` };
  }
  revalidatePath(`/events/${id}`, "layout");
  if (move) redirect(`${base(id)}/${t}?moved=${gid}`);
  const left = guests.filter((x) => x.id !== gid && !x.table_no).length;
  redirect(left ? `${base(id)}/manuel?placed=${gid}&t=${t}` : `${base(id)}?complete=${gid}&t=${t}`);
}

/** Permutation confirmée de deux invités placés sur des tables différentes ; rien n'est enregistré si la vérification échoue. */
export async function confirmSwap(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), a = String(fd.get("a")), b = String(fd.get("b"));
  if (!UUID.test(id) || !UUID.test(a) || !UUID.test(b) || a === b) return { ok: false, message: "Choisissez deux invités différents." };
  const { guests } = await ctx(id);
  const ga = guests.find((g) => g.id === a), gb = guests.find((g) => g.id === b);
  if (!ga || !gb) return { ok: false, message: "Invité introuvable." };
  if (!ga.table_no || !gb.table_no) return { ok: false, message: "Les deux invités doivent être placés à une table : pour placer un invité sans table, utilisez le placement manuel." };
  if (ga.table_no === gb.table_no) return { ok: false, message: "Ces deux invités sont déjà à la même table : rien à permuter." };
  const r = await save(id, { [a]: gb.table_no, [b]: ga.table_no }, `Permutation : ${ga.name} (table ${gb.table_no}) ⇄ ${gb.name} (table ${ga.table_no})`);
  if (!r?.ok) return { ok: false, message: `Permutation refusée, aucune place n’a changé : ${r?.message}` };
  redirect(`${base(id)}?swapped=${a},${b}`);
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
