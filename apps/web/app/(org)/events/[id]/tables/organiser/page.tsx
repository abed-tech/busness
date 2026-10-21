import Link from "next/link";
import { redirect } from "next/navigation";
import { tableData } from "@/lib/tables";
import { PageHeader } from "@/components/ui";
import { plur } from "@/lib/format";

/** Ouvert par le bouton flottant : deux choix seulement, chacun vers sa propre page. */
export default async function Organiser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { unplaced, guests, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  const placed = guests.length - unplaced.length;
  return (
    <>
      <PageHeader eyebrow="Tables" title="Que voulez-vous faire ?" />
      <div className="choices">
        <Link className="choicecard" href={`${base}/placer`}>
          <b>Placer les invités</b>
          <small>Asseoir les invités qui n’ont pas encore de table, automatiquement ou un par un.</small>
          <span className="hint">{plur(unplaced.length, "invitation")} sans table</span>
        </Link>
        <Link className="choicecard" href={`${base}/permuter`}>
          <b>Permuter les invités</b>
          <small>Échanger les places de deux invités assis à des tables différentes.</small>
          <span className="hint">{plur(placed, "invitation placée", "invitations placées")}</span>
        </Link>
      </div>
    </>
  );
}
