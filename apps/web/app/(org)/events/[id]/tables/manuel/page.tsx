import Link from "next/link";
import { redirect } from "next/navigation";
import { tableData, kindHint } from "@/lib/tables";
import { PageHeader, Notice } from "@/components/ui";
import { plur } from "@/lib/format";

/**
 * « Invités non placés » : uniquement les invitations sans table. Après chaque placement, la liste est relue en base ;
 * quand plus personne n'est à placer, retour automatique à la liste des tables.
 */
export default async function Unplaced({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; t?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { guests, unplaced, tables, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  if (!unplaced.length) redirect(sp.placed ? `${base}?complete=${encodeURIComponent(sp.placed)}&t=${encodeURIComponent(sp.t || "")}` : base);
  const just = guests.find((g) => g.id === sp.placed);
  const free = tables.filter((t) => !t.ghost).reduce((s, t) => s + t.free, 0);
  return (
    <>
      <PageHeader eyebrow="Placement manuel" title="Invités non placés" sub={`${plur(unplaced.length, "invitation")} sans table · ${plur(free, "place libre", "places libres")}`} />
      {just && just.table_no && <Notice tone="ok">{just.name} placé(e) avec succès à la table {just.table_no}.</Notice>}
      <p className="hint" style={{ marginBottom: 10 }}>Touchez un invité pour choisir sa table.</p>
      <div className="list">
        {unplaced.map((g) => (
          <Link key={g.id} className="li pickrow" href={`${base}/manuel/${g.id}`}>
            <span style={{ flex: 1, minWidth: 0 }}><b>{g.name}</b><small className="hint" style={{ display: "block" }}>{kindHint(g)}{g.rsvp === "yes" ? " · présence confirmée" : g.rsvp === "no" ? " · ne vient pas" : ""}</small></span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
