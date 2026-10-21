import { redirect } from "next/navigation";
import { persons } from "@ceremonia/core";
import { tableData } from "@/lib/tables";
import { PageHeader, Notice } from "@/components/ui";
import { CardAction } from "@/components/TableActions";
import { plur } from "@/lib/format";
import { autoPlace } from "../actions";

/** Placement automatique : récapitulatif réel, puis répartition enregistrée en base et ouverture des résultats. */
export default async function AutoPlacement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { unplaced, tables, write } = await tableData(id);
  if (!write) redirect(`/events/${id}/tables`);
  const real = tables.filter((t) => !t.ghost);
  const free = real.reduce((s, t) => s + t.free, 0);
  const need = persons(unplaced);
  return (
    <>
      <PageHeader eyebrow="Placer les invités" title="Placement automatique" />
      <section className="card form" style={{ maxWidth: 720 }}>
        <dl className="kv">
          <dt>Invités sans table</dt><dd>{plur(unplaced.length, "invitation")} · {plur(need, "personne")}</dd>
          <dt>Tables</dt><dd>{plur(real.length, "table")} · {plur(free, "place libre", "places libres")}</dd>
        </dl>
        <p className="hint">Les couples restent ensemble et les personnes seules sont regroupées autant que possible. Aucune table n’est dépassée. Les invités déjà placés gardent leur table.</p>
        {!unplaced.length && <Notice tone="ok">Tous les invités ont déjà une table : rien à placer.</Notice>}
        {need > free && <Notice tone="bad">Il manque {need - free} place(s) : une partie des invités restera sans table. Vous pourrez ajouter une table depuis la page des tables.</Notice>}
        <CardAction action={autoPlace} hidden={{ event_id: id }} className="btn pay-main" pendingLabel="Placement en cours…">
          Lancer le placement automatique
        </CardAction>
      </section>
    </>
  );
}
