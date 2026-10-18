import { loads, tableCount, KIND_LABEL } from "@ceremonia/core";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, canWrite, evShape } from "@/lib/event";
import { PageHeader, Empty } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { MoveSelect } from "@/components/MoveSelect";
import { plur } from "@/lib/format";
import { autoAssignAction, swapGuests, changeTables } from "./actions";

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
  const opts = L.filter((l) => !l.ghost).map((l) => ({ n: l.n, free: l.free }));
  return (
    <>
      <PageHeader eyebrow="Préparer" title="Tables" sub={`${plur(tc, "table")} de ${ev.table_capacity} places · ${plur(free, "place libre", "places libres")} · ${plur(unplaced.length, "invitation")} sans table`} />
      {write && (
        <div className="grid g2" style={{ marginBottom: 16 }}>
          <section className="card form">
            <h2>Placement automatique</h2>
            <ActionForm action={autoAssignAction} hidden={{ event_id: id }} submit="Placer les invités">
              <div className="fld"><label htmlFor="st">Méthode</label><select id="st" name="strategy" defaultValue="fill"><option value="fill">Remplir les tables une par une</option><option value="balance">Répartir équitablement</option></select></div>
              <label className="check"><input type="checkbox" name="keep" defaultChecked /> Garder les placements faits à la main</label>
              <p className="hint">Les couples restent toujours ensemble et aucune table n’est dépassée. Si c’est impossible, rien n’est modifié.</p>
            </ActionForm>
          </section>
          <section className="card form">
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
        </div>
      )}
      {!guests.length ? <Empty>Ajoutez d’abord des invités.</Empty> : (
        <>
          {unplaced.length > 0 && (
            <section className="card form" style={{ marginBottom: 16 }}>
              <h2>Sans table ({unplaced.length})</h2>
              {unplaced.map((g) => (
                <div key={g.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{g.name} <span className="hint">· {g.kind ? KIND_LABEL[g.kind] : "statut à préciser"}</span></span>
                  {write && <MoveSelect eventId={id} guestId={g.id} current={0} seats={g.kind === "couple" ? 2 : 1} tables={opts} />}
                </div>
              ))}
            </section>
          )}
          <div className="tables-grid">
            {L.map((l) => (
              <section key={l.n} className={"tcard" + (l.used > ev.table_capacity || l.ghost ? " over" : l.free === 0 ? " full" : "")}>
                <h3><span>Table {l.n}</span><span className="hint">{l.used}/{ev.table_capacity}</span></h3>
                {l.ghost && <p className="hint" style={{ color: "var(--bad)" }}>Cette table n’existe plus : déplacez ses invités.</p>}
                {!l.guests.length ? <p className="hint">Table vide</p> : l.guests.map((g) => (
                  <div key={g.id} style={{ display: "grid", gap: 4 }}>
                    <span>{g.name}{g.kind === "couple" && <span className="hint"> · 2 places</span>}{g.placed_manually && <span className="hint"> · placé à la main</span>}</span>
                    {write && <MoveSelect eventId={id} guestId={g.id} current={l.n} seats={g.kind === "couple" ? 2 : 1} tables={opts} />}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
