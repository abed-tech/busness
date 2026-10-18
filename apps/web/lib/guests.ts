import "server-only";
import { autoAssign, type Guest } from "@ceremonia/core";
import { humanError } from "./auth";
import { serverClient } from "./data/server";

type R = { ok?: boolean; message?: string };
const fail = (message: string): R => ({ ok: false, message });

// Fonctions internes (pas des actions serveur : non appelables depuis le navigateur).
export async function insertGuests(eventId: string, rows: { name: string; kind: string | null; whatsapp: string }[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const sb = await serverClient();
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("guests").insert(rows.slice(i, i + 200).map((r) => ({ event_id: eventId, ...r })));
    if (error) return { ok: false, message: humanError(error.message, error.code) };
  }
  return { ok: true };
}

export async function runAutoAssign(eventId: string, keep: boolean, strategy: "fill" | "balance"): Promise<R> {
  const sb = await serverClient();
  const [{ data: ev }, { data: guests }] = await Promise.all([
    sb.from("events").select("table_capacity, expected, extra_tables").eq("id", eventId).maybeSingle(),
    sb.from("guests").select("id, name, kind, table_no, placed_manually").eq("event_id", eventId).order("sort_order"),
  ]);
  if (!ev || !guests) return fail("Événement introuvable.");
  const res = autoAssign(ev, guests as Guest[], { keep, strategy });
  if (!res.ok) return fail(res.errors.join(" "));
  const { error } = await sb.rpc("save_table_plan", { p_event: eventId, p_plan: res.plan, p_manual: false, p_label: `Attribution automatique : ${res.placed} invitation(s) placée(s)` });
  if (error) return fail(humanError(error.message, error.code));
  return { ok: true, message: `${res.placed} invitation(s) placée(s). Couples ensemble, aucune table dépassée.` };
}

