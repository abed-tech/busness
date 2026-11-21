import Link from "next/link";
import { redirect } from "next/navigation";
import { tableCount } from "@ceremonia/core";
import { tableData, kindHint, seatsOf } from "@/lib/tables";
import { evShape } from "@/lib/event";
import { PageHeader, Empty } from "@/components/ui";
import { MultiSwap } from "@/components/MultiSwap";
import { confirmSwap } from "../actions";

/**
 * Permutation d'un ou plusieurs invités assis : groupe A (à déplacer) et groupe B (avec qui permuter), chacun avec sa recherche.
 * Le n-ième invité du groupe A échange sa place avec le n-ième du groupe B ; aperçu des échanges et contrôle de capacité,
 * puis confirmation. La vérification est refaite par le serveur ; rien n'est enregistré en cas d'échec.
 */
export default async function Permuter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev, guests, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  const placed = guests.filter((g) => g.table_no);
  const rows = placed
    .map((g) => ({ id: g.id, name: g.name, hint: kindHint(g), seats: seatsOf(g), table: g.table_no! }))
    .sort((x, y) => x.table - y.table || x.name.localeCompare(y.name, "fr"));
  const enough = placed.length >= 2 && new Set(placed.map((g) => g.table_no)).size >= 2;
  return (
    <>
      <PageHeader eyebrow="Tables" title="Permuter les invités" sub="Échangez les places d’un ou de plusieurs invités assis à des tables différentes." />
      {!enough ? (
        <Empty>Il faut au moins deux invités assis à deux tables différentes pour permuter. <br /><br /><Link className="btn" href={`${base}/placer`}>Placer les invités</Link></Empty>
      ) : (
        <>
          {/* key : après un refus du serveur suivi d'une actualisation, la sélection repart des données du moment */}
          <MultiSwap key={rows.map((r) => `${r.id}:${r.table}`).join("|")} eventId={id} guests={rows} cap={ev.table_capacity} tables={tableCount(evShape(ev), guests)} action={confirmSwap} />
          <div className="row" style={{ marginTop: 14 }}><Link className="btn ghost" href={base}>Annuler</Link></div>
        </>
      )}
    </>
  );
}
