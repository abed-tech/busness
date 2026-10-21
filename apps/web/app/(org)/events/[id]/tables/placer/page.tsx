import Link from "next/link";
import { redirect } from "next/navigation";
import { tableData } from "@/lib/tables";
import { PageHeader } from "@/components/ui";
import { plur } from "@/lib/format";

/** « Placer les invités » : placement automatique ou manuel, chacun sur sa propre page. */
export default async function Placer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { unplaced, tables, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  const free = tables.filter((t) => !t.ghost).reduce((s, t) => s + t.free, 0);
  return (
    <>
      <PageHeader eyebrow="Tables" title="Placer les invités" sub={`${plur(unplaced.length, "invitation")} sans table · ${plur(free, "place libre", "places libres")}`} />
      <div className="choices">
        <Link className="choicecard" href={`${base}/auto`}>
          <b>Placement automatique</b>
          <small>Les invités sans table sont répartis sur les places libres : couples ensemble, personnes seules regroupées, capacité respectée. Les invités déjà placés gardent leur table.</small>
        </Link>
        <Link className="choicecard" href={`${base}/manuel`}>
          <b>Placement manuel</b>
          <small>Choisissez un invité sans table, puis la table où l’asseoir. Seules les tables où il reste de la place sont proposées.</small>
        </Link>
      </div>
    </>
  );
}
