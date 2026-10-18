"use client";
import { useActionState } from "react";
import { moveGuest } from "@/app/(org)/events/[id]/tables/actions";
import type { ActionState } from "@/components/ConfirmAction";

/** Déplacement d'un invité : seules les tables où il tient sont proposées ; le serveur revérifie. */
export function MoveSelect({ eventId, guestId, current, seats, tables }: { eventId: string; guestId: string; current: number; seats: number; tables: { n: number; free: number }[] }) {
  const [s, run, pending] = useActionState<ActionState, FormData>(moveGuest, null);
  return (
    <form action={run} className="row" style={{ gap: 6 }}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="guest_id" value={guestId} />
      <select name="table" className="in" style={{ width: "auto", padding: "6px 8px" }} defaultValue="" aria-label="Déplacer vers" required>
        <option value="" disabled>Déplacer vers…</option>
        {tables.filter((t) => t.n !== current && t.free >= seats).map((t) => <option key={t.n} value={t.n}>Table {t.n} ({t.free} libre{t.free > 1 ? "s" : ""})</option>)}
        {current > 0 && <option value="0">Retirer de la table</option>}
      </select>
      <button className="btn ghost sm" disabled={pending}>{pending ? "…" : "OK"}</button>
      {s?.ok === false && <span className="badge bad">{s.message}</span>}
    </form>
  );
}
