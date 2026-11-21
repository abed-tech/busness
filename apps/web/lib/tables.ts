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
/**
 * Plan d'une permutation de groupes : les invités de A (une ou plusieurs tables) vont tous à la table de B ;
 * ceux de B (une seule table) occupent les places libérées par A, table d'origine après table d'origine.
 * Si ça ne tient pas, le surplus va à la table d'origine la moins pleine et la vérification de capacité refuse le plan.
 */
type Seated = { id: string; kind: string | null; table_no: number | null };
export function planGroupSwap(A: Seated[], B: Seated[]): Record<string, number> {
  const tb = B[0].table_no!;
  const free = new Map<number, number>();
  for (const g of A) free.set(g.table_no!, (free.get(g.table_no!) || 0) + seatsOf(g));
  const origin = [...free.keys()].sort((x, y) => x - y);
  const moves: Record<string, number> = {};
  for (const g of A) moves[g.id] = tb;
  for (const g of B) {
    const n = seatsOf(g);
    const t = origin.find((o) => free.get(o)! >= n) ?? origin.reduce((best, o) => (free.get(o)! > free.get(best)! ? o : best), origin[0]);
    moves[g.id] = t;
    free.set(t, free.get(t)! - n);
  }
  return moves;
}
export const kindHint = (g: { kind: string | null }) => (g.kind === "couple" ? "couple · 2 places" : !g.kind ? "statut à préciser · 1 place" : "1 place");
