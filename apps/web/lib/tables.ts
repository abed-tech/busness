import "server-only";
import { loads, seats, type Guest } from "@ceremonia/core";
import { requireOrganizer } from "./auth";
import { loadEvent, loadGuests, canWrite, evShape, type GuestRow } from "./event";

export type TableView = { n: number; used: number; cap: number; free: number; ghost: boolean; guests: GuestRow[] };

/** Tables et invités de l'événement, lus en base à chaque affichage (jamais d'état temporaire côté interface). */
export async function tableData(id: string) {
  const me = await requireOrganizer();
  const ev = await loadEvent(id);
  const guests = await loadGuests(id);
  const tables: TableView[] = loads(evShape(ev), guests as Guest[]).map((l) => ({
    n: l.n, used: l.used, cap: ev.table_capacity, free: Math.max(0, l.free), ghost: l.ghost, guests: l.guests as GuestRow[],
  }));
  const unplaced = guests.filter((g) => !g.table_no);
  return { me, ev, guests, tables, unplaced, write: canWrite(ev, me) };
}

export const seatsOf = (g: { kind: string | null }) => seats({ kind: (g.kind as Guest["kind"]) || null });
export const kindHint = (g: { kind: string | null }) => (g.kind === "couple" ? "couple · 2 places" : !g.kind ? "statut à préciser · 1 place" : "1 place");
