import "server-only";
import { notFound } from "next/navigation";
import type { Guest } from "@ceremonia/core";
import { serverClient } from "./data/server";
import type { Organizer } from "./auth";

export interface EventRow {
  id: string; short_id: string; owner_id: string | null; organizer_id: string | null; organizer_can_manage: boolean;
  origin: string; billing: "paid" | "free_admin"; status: "active" | "suspended" | "deleted"; status_reason: string | null;
  type: string; host_a: string; host_b: string; title: string; event_date: string; event_time: string;
  venue: string; address: string; dress: string; message: string; program: string;
  expected: number; table_capacity: number; extra_tables: number; phone_prefix: string; offer: "both" | "drinks" | "food" | "none";
  photos: string[]; service_key: string; created_at: string;
}
export type GuestRow = Guest & { whatsapp: string; rsvp: "yes" | "no" | null; invite_token: string; code: string; whatsapp_opened_at: string | null; sort_order: number };
export interface CatalogItem { id: string; kind: "drink" | "dish"; name: string }

const EVENT_COLS = "id, short_id, owner_id, organizer_id, organizer_can_manage, origin, billing, status, status_reason, type, host_a, host_b, title, event_date, event_time, venue, address, dress, message, program, expected, table_capacity, extra_tables, phone_prefix, offer, photos, service_key, created_at";

/** Charge un événement accessible à l'organisateur (la base refuse les autres : RLS). */
export async function loadEvent(id: string): Promise<EventRow> {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const sb = await serverClient();
  const { data } = await sb.from("events").select(EVENT_COLS).eq("id", id).neq("status", "deleted").maybeSingle();
  if (!data) notFound();
  return data as EventRow;
}

export async function loadGuests(eventId: string): Promise<GuestRow[]> {
  const sb = await serverClient();
  const { data } = await sb.from("guests").select("id, name, kind, table_no, placed_manually, whatsapp, rsvp, invite_token, code, whatsapp_opened_at, sort_order").eq("event_id", eventId).order("sort_order");
  return (data || []) as GuestRow[];
}

export async function loadCatalog(eventId: string): Promise<CatalogItem[]> {
  const sb = await serverClient();
  const { data } = await sb.from("catalog_items").select("id, kind, name").eq("event_id", eventId).order("created_at");
  return (data || []) as CatalogItem[];
}

/** Indication d'interface seulement : la base revérifie chaque écriture. */
export function canWrite(ev: EventRow, me: Organizer): boolean {
  return ev.status === "active" && me.status === "active" && (ev.owner_id === me.id || (ev.organizer_id === me.id && ev.organizer_can_manage));
}

export const evShape = (ev: EventRow) => ({ table_capacity: ev.table_capacity, expected: ev.expected, extra_tables: ev.extra_tables });

/** Adresse publique d'une photo d'invitation (servie par /media/event-photos, depuis la base). */
export function photoUrl(path: string): string {
  return `/media/event-photos/${path.split("/").map(encodeURIComponent).join("/")}`;
}
