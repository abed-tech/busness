"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseGuests } from "@ceremonia/core";
import { insertGuests, runAutoAssign } from "@/lib/guests";
import { requireOrganizer, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { putPhoto, removePhotos } from "@ceremonia/server";
import { EventSchema, lines } from "@/lib/schemas";
import type { ActionState } from "@/components/ConfirmAction";

const fail = (message: string): ActionState => ({ ok: false, message });

/** Création : l'événement, ses listes de boissons et de plats, puis les invités éventuels. */
export async function createEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireOrganizer();
  if (me.status !== "active") return fail("Compte suspendu : création impossible.");
  const p = EventSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]?.message || "Formulaire invalide.");
  const sb = await serverClient();
  const { data: ev, error } = await sb.from("events").insert({ ...p.data, owner_id: me.id }).select("id").single();
  if (error || !ev) return fail(humanError(error?.message || "", error?.code));
  const items = [
    ...(p.data.offer === "both" || p.data.offer === "drinks" ? lines(fd.get("drinks")).map((name) => ({ event_id: ev.id, kind: "drink", name })) : []),
    ...(p.data.offer === "both" || p.data.offer === "food" ? lines(fd.get("dishes")).map((name) => ({ event_id: ev.id, kind: "dish", name })) : []),
  ];
  if (items.length) {
    const { error: e2 } = await sb.from("catalog_items").insert(items);
    if (e2) return fail(`Événement créé, mais les listes n’ont pas pu être enregistrées : ${humanError(e2.message, e2.code)}`);
  }
  const text = String(fd.get("guests") || "");
  if (text.trim()) {
    const g = parseGuests(text, p.data.phone_prefix);
    if (g.rows.length > 1500) return fail("1 500 invitations au maximum par importation.");
    const ins = await insertGuests(ev.id, g.rows.map((r) => ({ name: r.name, kind: r.kind || null, whatsapp: r.whatsapp })));
    if (!ins.ok) return fail(`Événement créé, mais les invités n’ont pas pu être enregistrés : ${ins.message}`);
    if (fd.get("auto") === "on") await runAutoAssign(ev.id, false, "fill");
  }
  revalidatePath("/events");
  redirect(`/events/${ev.id}/photos?new=1`); // 8ᵉ écran : photos (au moins une)
}

export async function updateEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const p = EventSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]?.message || "Formulaire invalide.");
  const sb = await serverClient();
  const { error, count } = await sb.from("events").update(p.data, { count: "exact" }).eq("id", id);
  if (error) return fail(humanError(error.message, error.code));
  if (!count) return fail("Modification refusée : l’événement est suspendu ou vous n’en êtes pas le gestionnaire.");
  revalidatePath(`/events/${id}`, "layout");
  redirect(`/events/${id}?updated=1`);
}

/** Réglages rapides de l'accueil : capacité, personnes attendues, indicatif. */
export async function updateSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const p = EventSchema.pick({ table_capacity: true, expected: true, phone_prefix: true }).safeParse(Object.fromEntries(fd));
  if (!p.success) return fail(p.error.issues[0]?.message || "Valeurs invalides.");
  const sb = await serverClient();
  const { error, count } = await sb.from("events").update(p.data, { count: "exact" }).eq("id", id);
  if (error) return fail(humanError(error.message, error.code));
  if (!count) return fail("Modification refusée.");
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: "Réglages enregistrés." };
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Photos : 4 au maximum, 6 Mo chacune, JPEG/PNG/WebP. Le contenu est vérifié (signature du fichier), pas seulement l'extension. */
export async function uploadPhotos(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const sb = await serverClient();
  const { data: ev } = await sb.from("events").select("photos").eq("id", id).maybeSingle();
  if (!ev) return fail("Événement introuvable.");
  const files = fd.getAll("photos").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f && (f as File).size > 0);
  if (!files.length) return fail("Choisissez au moins une photo.");
  if (ev.photos.length + files.length > 4) return fail(`4 photos au maximum : vous pouvez encore en ajouter ${4 - ev.photos.length}.`);
  const added: string[] = [];
  for (const f of files) {
    if (f.size > 6 * 1024 * 1024) return fail(`« ${f.name} » dépasse 6 Mo. Choisissez une photo plus légère.`);
    const head = new Uint8Array(await f.slice(0, 12).arrayBuffer());
    const type = head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg" : head[0] === 0x89 && head[1] === 0x50 ? "image/png" : head[8] === 0x57 && head[9] === 0x45 ? "image/webp" : "";
    if (!type) return fail(`« ${f.name} » n’est pas une photo JPEG, PNG ou WebP. (Les photos HEIC de l’iPhone doivent être converties : partagez-la en « Plus compatible ».)`);
    const path = `${id}/${crypto.randomUUID()}.${PHOTO_TYPES[type]}`;
    const { error } = await putPhoto(sb.ctx, path, id, Buffer.from(await f.arrayBuffer()), type);
    if (error) {
      await removePhotos(sb.ctx, added);
      return fail(error.code === "42501" ? "Modification refusée : vous ne gérez pas cet événement." : `La photo « ${f.name} » n’a pas pu être enregistrée. Réessayez.`);
    }
    added.push(path);
  }
  const { error } = await sb.from("events").update({ photos: [...ev.photos, ...added] }).eq("id", id);
  if (error) {
    await removePhotos(sb.ctx, added);
    return fail(humanError(error.message, error.code));
  }
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: `${added.length} photo(s) ajoutée(s).` };
}

const LAST_PHOTO = "Gardez au moins une photo : ajoutez d’abord la nouvelle, puis retirez celle-ci.";
export async function removePhoto(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), path = String(fd.get("path"));
  const sb = await serverClient();
  const { data: ev } = await sb.from("events").select("photos").eq("id", id).maybeSingle();
  if (!ev || !ev.photos.includes(path)) return fail("Photo introuvable.");
  if (ev.photos.length <= 1) return fail(LAST_PHOTO);
  const { error } = await sb.from("events").update({ photos: ev.photos.filter((p: string) => p !== path) }).eq("id", id);
  if (error) return fail(humanError(error.message, error.code));
  await removePhotos(sb.ctx, [path]);
  revalidatePath(`/events/${id}`, "layout");
  return { ok: true, message: "Photo retirée." };
}

/** Suppression par le propriétaire, confirmée en recopiant le nom ; droits et purge vérifiés par la base (delete_my_event). */
export async function deleteEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Événement introuvable.");
  const sb = await serverClient();
  const { error } = await sb.rpc("delete_my_event", { p_event: id, p_confirm_title: String(fd.get("confirm") || "") });
  if (error) return fail(humanError(error.message, error.code));
  revalidatePath("/events");
  revalidatePath(`/events/${id}`, "layout");
  redirect("/events?deleted=1");
}

export async function rotateServiceKey(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const sb = await serverClient();
  const { error } = await sb.rpc("rotate_service_key", { p_event: id });
  if (error) return fail(humanError(error.message, error.code));
  revalidatePath(`/events/${id}`);
  return { ok: true, message: "Nouveau lien créé. L’ancien ne fonctionne plus." };
}
