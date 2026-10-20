import { loads, tableCount, type Guest } from "@ceremonia/core";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, canWrite, evShape } from "@/lib/event";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SeatingManager } from "@/components/SeatingManager";
import { plur } from "@/lib/format";
import { swapGuests, changeTables } from "./actions";

export default async function Tables({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  const guests = await loadGuests(id);
  const shape = evShape(ev);
  const L = loads(shape, guests);
  const tc = tableCount(shape, guests);
  const unplaced = guests.filter((g) => !g.table_no);
  const write = canWrite(ev, me);
  const free = L.filter((l) => !l.ghost).reduce((s, l) => s + Math.max(0, l.free), 0);
  const slim = (g: Guest) => ({ id: g.id, name: g.name, kind: g.kind, manual: g.placed_manually });
  return (
    <>
      <PageHeader eyebrow="Préparer" title="Tables" sub={`${plur(tc, "table")} de ${ev.table_capacity} places · ${plur(free, "place libre", "places libres")} · ${plur(unplaced.length, "invitation")} sans table`} />
      {!guests.length ? <Empty>Ajoutez d’abord des invités.</Empty> : (
        <SeatingManager eventId={id} cap={ev.table_capacity} write={write}
          tables={L.map((l) => ({ n: l.n, used: l.used, free: l.free, ghost: l.ghost, guests: l.guests.map(slim) }))}
          unplaced={unplaced.map(slim)} />
      )}
      {write && (
        <section className="card form" style={{ marginTop: 16 }}>
          <h2>Échanger deux invités</h2>
          <ActionForm action={swapGuests} hidden={{ event_id: id }} submit="Échanger leurs places">
            <div className="grid g2">
              {(["a", "b"] as const).map((k, i) => (
                <div className="fld" key={k}><label htmlFor={"sw" + k}>{i ? "Avec" : "Invité"}</label>
                  <select id={"sw" + k} name={k} required defaultValue=""><option value="" disabled>Choisir</option>{guests.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.table_no ? "T" + g.table_no : "sans table"})</option>)}</select></div>
              ))}
            </div>
          </ActionForm>
          <div className="row">
            <ActionForm action={changeTables} hidden={{ event_id: id, op: "add" }} submit="+ Ajouter une table" />
            {ev.extra_tables > 0 && <ActionForm action={changeTables} hidden={{ event_id: id, op: "remove" }} submit="Retirer une table ajoutée" />}
          </div>
        </section>
      )}
    </>
  );
}
