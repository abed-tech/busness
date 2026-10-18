"use server";
import { revalidatePath } from "next/cache";
import { requireOrganizer, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { lines } from "@/lib/schemas";
import type { ActionState } from "@/components/ConfirmAction";

const kindOf = (v: FormDataEntryValue | null) => (v === "dish" ? "dish" : "drink");

export async function addItems(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), kind = kindOf(fd.get("kind"));
  const names = lines(fd.get("names"), 60);
  if (!names.length) return { ok: false, message: "Saisissez au moins un nom." };
  const sb = await serverClient();
  const { data: existing } = await sb.from("catalog_items").select("name").eq("event_id", id).eq("kind", kind);
  const have = new Set((existing || []).map((x: { name: string }) => x.name.toLowerCase()));
  const fresh = names.filter((n) => !have.has(n.toLowerCase()));
  if (!fresh.length) return { ok: false, message: "Ces éléments sont déjà dans la liste." };
  const { error } = await sb.from("catalog_items").insert(fresh.map((name) => ({ event_id: id, kind, name })));
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: `${fresh.length} élément(s) ajouté(s).` };
}

export async function renameItem(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), item = String(fd.get("item_id"));
  const name = String(fd.get("name") || "").trim().slice(0, 80);
  if (!name) return { ok: false, message: "Nom requis." };
  const sb = await serverClient();
  const { error, count } = await sb.from("catalog_items").update({ name }, { count: "exact" }).eq("id", item).eq("event_id", id);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  if (!count) return { ok: false, message: "Modification refusée." };
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: "Renommé." };
}

/** Un élément déjà choisi par des invités ne peut pas être supprimé (leurs choix resteraient sans objet). */
export async function deleteItem(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), item = String(fd.get("item_id"));
  const sb = await serverClient();
  const { data: orders } = await sb.from("guest_orders").select("drinks, dishes").eq("event_id", id);
  const used = (orders || []).filter((o: { drinks: string[]; dishes: string[] }) => o.drinks.includes(item) || o.dishes.includes(item)).length;
  if (used) return { ok: false, message: `Déjà choisi par ${used} invitation(s) : renommez-le plutôt que de le supprimer.` };
  const { error, count } = await sb.from("catalog_items").delete({ count: "exact" }).eq("id", item).eq("event_id", id);
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  if (!count) return { ok: false, message: "Suppression refusée." };
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: "Supprimé." };
}
