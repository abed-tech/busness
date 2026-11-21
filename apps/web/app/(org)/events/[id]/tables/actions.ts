"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkMoves, planSeating, seats, tableCount, type Guest, type Plan } from "@ceremonia/core";
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

/**
 * Placement manuel groupé : plusieurs invités sans table, tous à la même table, en une seule opération.
 * Revérifié sur les données du moment (invités de l'événement, toujours sans table, table existante, places suffisantes),
 * puis enregistré en une seule transaction : la base recompte sous verrou et refuse tout dépassement (rien n'est placé).
 */
export async function placeGuests(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const t = Number(fd.get("table"));
  const ids = [...new Set(fd.getAll("guest_ids").map(String))];
  if (!UUID.test(id)) return { ok: false, message: "Événement introuvable." };
  if (!Number.isInteger(t) || t < 1) return { ok: false, message: "Choisissez une table de destination." };
  if (!ids.length) return { ok: false, message: "Sélectionnez au moins un invité." };
  if (ids.length > 500 || !ids.every((g) => UUID.test(g))) return { ok: false, message: "Sélection invalide." };
  const { sb, ev, guests } = await ctx(id);
  if (!ev) return { ok: false, message: "Événement introuvable." };
  const picked = ids.map((g) => guests.find((x) => x.id === g));
  if (picked.some((g) => !g)) return { ok: false, message: "Un invité sélectionné n’appartient pas (ou plus) à cet événement. Actualisez la page." };
  const sel = picked as Guest[];
  const taken = sel.filter((g) => g.table_no);
  if (taken.length) return { ok: false, message: `Déjà placé(e) entre-temps : ${taken.map((g) => `${g.name} (table ${g.table_no})`).join(", ")}. Actualisez la page puis refaites la sélection.` };
  if (t > tableCount(ev, guests)) return { ok: false, message: `La table ${t} n’existe pas.` };
  const need = sel.reduce((s, g) => s + seats(g), 0);
  const free = ev.table_capacity - guests.filter((g) => g.table_no === t).reduce((s, g) => s + seats(g), 0);
  if (need > free) return { ok: false, message: `La table ${t} n’a que ${Math.max(0, free)} place(s) libre(s) pour ${need} place(s) demandée(s) (elle vient peut-être d’être complétée). Rien n’a été placé.` };
  const plan: Plan = Object.fromEntries(sel.map((g) => [g.id, t]));
  const errs = checkMoves(ev, guests, plan);
  if (errs.length) return { ok: false, message: `${errs.join(" ")} Rien n’a été placé.` };
  const { error } = await sb.rpc("save_table_plan", { p_event: id, p_plan: plan, p_manual: true, p_label: `${sel.length} invitation(s) placée(s) à la table ${t}` });
  if (error) {
    return { ok: false, message: error.code === "23514"
      ? `La table ${t} n’a plus assez de places (elle vient d’être complétée). Rien n’a été placé : choisissez une autre table.`
      : `Le placement n’a pas été enregistré : ${humanError(error.message, error.code)}` };
  }
  revalidatePath(`/events/${id}`, "layout");
  const left = guests.filter((x) => !x.table_no && !(x.id in plan)).length;
  redirect(left ? `${base(id)}/manuel?many=${sel.length}&t=${t}` : `${base(id)}?many=${sel.length}&t=${t}`);
}

/**
 * Permutation confirmée d'une ou plusieurs paires : le n-ième invité « a » échange sa place avec le n-ième invité « b ».
 * Revérifié sur les données du moment (invités de l'événement, placés, chacun dans une seule paire, tables différentes,
 * tables inchangées depuis l'aperçu, capacité après l'ensemble des échanges), puis enregistré en une seule transaction.
 * Rien n'est enregistré si une vérification échoue ; les autres invités ne sont pas touchés.
 */
export async function confirmSwap(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const as = fd.getAll("a").map(String), bs = fd.getAll("b").map(String);
  const at = fd.getAll("at").map(Number), bt = fd.getAll("bt").map(Number);
  if (!UUID.test(id)) return { ok: false, message: "Événement introuvable." };
  if (!as.length || !bs.length) return { ok: false, message: "Sélectionnez au moins un invité dans chaque groupe." };
  if (as.length !== bs.length) return { ok: false, message: `Les deux groupes doivent contenir le même nombre d’invités (${as.length} et ${bs.length}).` };
  if (as.length > 200 || ![...as, ...bs].every((g) => UUID.test(g))) return { ok: false, message: "Sélection invalide." };
  if (new Set([...as, ...bs]).size !== as.length * 2) return { ok: false, message: "Un même invité ne peut être sélectionné qu’une seule fois, dans un seul groupe." };
  const { guests } = await ctx(id);
  const find = (gid: string) => guests.find((g) => g.id === gid);
  const pairs = as.map((a, i) => [find(a), find(bs[i])] as const);
  if (pairs.some(([ga, gb]) => !ga || !gb)) return { ok: false, message: "Un invité sélectionné n’appartient pas (ou plus) à cet événement. Actualisez la page." };
  const ps = pairs as unknown as [Guest, Guest][];
  const unseated = ps.flat().filter((g) => !g.table_no);
  if (unseated.length) return { ok: false, message: `Doivent être placés à une table : ${unseated.map((g) => g.name).join(", ")}. Pour placer un invité sans table, utilisez le placement manuel.` };
  // Si les tables ont changé depuis l'aperçu, l'organisateur doit revoir les échanges avant de confirmer.
  const stale = at.length === as.length && bt.length === bs.length && ps.some(([ga, gb], i) => ga.table_no !== at[i] || gb.table_no !== bt[i]);
  if (stale) return { ok: false, message: "Des places ont changé depuis l’aperçu : actualisez la page et vérifiez les échanges. Aucune place n’a été modifiée." };
  const same = ps.filter(([ga, gb]) => ga.table_no === gb.table_no);
  if (same.length) return { ok: false, message: `Déjà à la même table, rien à permuter : ${same.map(([ga, gb]) => `${ga.name} ⇄ ${gb.name}`).join(", ")}.` };
  const plan: Plan = {};
  for (const [ga, gb] of ps) { plan[ga.id] = gb.table_no!; plan[gb.id] = ga.table_no!; }
  const label = ps.length === 1
    ? `Permutation : ${ps[0][0].name} (table ${ps[0][1].table_no}) ⇄ ${ps[0][1].name} (table ${ps[0][0].table_no})`
    : `Permutation de ${ps.length} paires : ${ps.map(([ga, gb]) => `${ga.name} ⇄ ${gb.name}`).join(", ")}`;
  const r = await save(id, plan, label.length > 480 ? label.slice(0, 477) + "…" : label);
  if (!r?.ok) return { ok: false, message: `Permutation refusée, aucune place n’a changé : ${r?.message}` };
  redirect(`${base(id)}?swapped=${ps.flatMap(([ga, gb]) => [ga.id, gb.id]).join(",")}`);
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
