import Link from "next/link";
import { redirect } from "next/navigation";
import { tableData, kindHint, seatsOf } from "@/lib/tables";
import { PageHeader, Notice } from "@/components/ui";
import { MultiPlace } from "@/components/MultiPlace";
import { plur } from "@/lib/format";
import { placeGuests } from "../actions";

/**
 * « Invités non placés » : uniquement les invitations sans table. Sélection multiple vers une table (dans la limite de ses
 * places), ou un invité seul via « Seul › ». Après chaque placement, la liste est relue en base ;
 * quand plus personne n'est à placer, retour automatique à la liste des tables.
 */
export default async function Unplaced({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; t?: string; many?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { guests, unplaced, tables, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  if (!unplaced.length) redirect(sp.placed ? `${base}?complete=${encodeURIComponent(sp.placed)}&t=${encodeURIComponent(sp.t || "")}` : base);
  const just = guests.find((g) => g.id === sp.placed);
  const many = Number(sp.many) || 0;
  const free = tables.filter((t) => !t.ghost).reduce((s, t) => s + t.free, 0);
  const open = tables.filter((t) => !t.ghost && t.free > 0).map((t) => ({ n: t.n, used: t.used, cap: t.cap, free: t.free, names: t.guests.map((g) => g.name) }));
  const rows = unplaced.map((g) => ({
    id: g.id, name: g.name, seats: seatsOf(g),
    hint: kindHint(g) + (g.rsvp === "yes" ? " · présence confirmée" : g.rsvp === "no" ? " · ne vient pas" : ""),
  }));
  return (
    <>
      <PageHeader eyebrow="Placement manuel" title="Invités non placés" sub={`${plur(unplaced.length, "invitation")} sans table · ${plur(free, "place libre", "places libres")}`} />
      {just && just.table_no && <Notice tone="ok">{just.name} placé(e) avec succès à la table {just.table_no}.</Notice>}
      {many > 0 && <Notice tone="ok">{plur(many, "invitation placée", "invitations placées")} avec succès à la table {sp.t}.</Notice>}
      {!open.length ? (
        <Notice tone="bad">Plus aucune table n’a de place libre. Ajoutez une table ou libérez des places depuis <Link href={base}>la page des tables</Link>.</Notice>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 10 }}>Choisissez une table, cochez les invités à y asseoir, puis « Placer les invités ». Pour un seul invité, « Seul › » propose toutes les tables où il tient.</p>
          <MultiPlace key={`${many}-${sp.t || ""}-${unplaced.length}`} eventId={id} guests={rows} tables={open} action={placeGuests} base={base} />
        </>
      )}
    </>
  );
}
