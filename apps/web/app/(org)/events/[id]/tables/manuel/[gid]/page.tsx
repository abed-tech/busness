import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tableData, seatsOf, kindHint } from "@/lib/tables";
import { PageHeader, Notice } from "@/components/ui";
import { CardAction } from "@/components/TableActions";
import { placeGuest } from "../../actions";

/**
 * « Choisir une table » : seules les tables où l'invité tient (au moins une place libre, deux pour un couple).
 * Avec ?move=1 : déplacement d'un invité déjà placé vers une place libre (distinct de la permutation).
 */
export default async function ChooseTable({ params, searchParams }: { params: Promise<{ id: string; gid: string }>; searchParams: Promise<{ move?: string }> }) {
  const { id, gid } = await params;
  const move = (await searchParams).move === "1";
  const { guests, tables, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  const g = guests.find((x) => x.id === gid);
  if (!g) notFound();
  if (!move && g.table_no) redirect(`${base}/manuel`); // déjà placé entre-temps : retour à la liste à jour
  const need = seatsOf(g);
  const open = tables.filter((t) => !t.ghost && t.n !== g.table_no && t.free >= need);
  const back = move ? `${base}/permuter` : `${base}/manuel`;
  return (
    <>
      <PageHeader eyebrow={move ? "Déplacer un invité" : "Placement manuel"} title="Choisir une table"
        sub={<>{g.name} · {kindHint(g)}{g.table_no ? ` · actuellement table ${g.table_no}` : ""}</>}
        actions={<Link className="btn ghost sm" href={back}>{move ? "Retour" : "Retour aux invités non placés"}</Link>} />
      {!open.length ? (
        <Notice tone="bad">
          Plus aucune table n’a {need > 1 ? "2 places libres côte à côte" : "de place disponible"} pour {g.name}. Ajoutez une table ou libérez des places.{" "}
          <Link href={back}>{move ? "Retour" : "Revenir à la liste des invités non placés"}</Link> · <Link href={base}>Page des tables</Link>
        </Notice>
      ) : (
        <div className="tables-grid">
          {open.map((t) => (
            <CardAction key={t.n} action={placeGuest} hidden={{ event_id: id, guest_id: g.id, table: String(t.n), mode: move ? "move" : "place" }} className="tcard pickcard" pendingLabel="Placement…">
              <span className="pick-h"><b>Table {t.n}</b><span className="badge ok">{t.free} place{t.free > 1 ? "s" : ""} restante{t.free > 1 ? "s" : ""}</span></span>
              <span className="hint">{t.used} occupée{t.used > 1 ? "s" : ""} sur {t.cap}</span>
              {t.guests.length > 0 && <span className="hint">{t.guests.map((x) => x.name).join(", ")}</span>}
            </CardAction>
          ))}
        </div>
      )}
      {open.length > 0 && need > 1 && <p className="hint" style={{ marginTop: 10 }}>Un couple occupe 2 places à la même table : seules les tables avec au moins 2 places libres sont proposées.</p>}
    </>
  );
}
