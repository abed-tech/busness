import Link from "next/link";
import { tableCount } from "@ceremonia/core";
import { tableData, kindHint } from "@/lib/tables";
import { evShape } from "@/lib/event";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { TableFab } from "@/components/TableFab";
import { plur } from "@/lib/format";
import { changeTables } from "./actions";

/** Tables de l'événement : chaque carte ouvre le détail de la table ; le bouton flottant ouvre le placement et la permutation. */
export default async function Tables({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ complete?: string; t?: string; swapped?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ev, guests, tables, unplaced, write } = await tableData(id);
  const tc = tableCount(evShape(ev), guests);
  const free = tables.filter((t) => !t.ghost).reduce((s, t) => s + t.free, 0);
  const name = (gid?: string) => guests.find((g) => g.id === gid)?.name;
  const [sa, sb] = (sp.swapped || "").split(",");
  const base = `/events/${id}/tables`;
  return (
    <>
      <PageHeader eyebrow="Préparer" title="Tables" sub={`${plur(tc, "table")} de ${ev.table_capacity} places · ${plur(free, "place libre", "places libres")} · ${plur(unplaced.length, "invitation")} sans table`} />
      {name(sp.complete) && <Notice tone="ok">{name(sp.complete)} placé(e) avec succès à la table {sp.t}. Tous les invités ont maintenant une table.</Notice>}
      {name(sa) && name(sb) && <Notice tone="ok">Permutation enregistrée : {name(sa)} et {name(sb)} ont échangé leurs places.</Notice>}
      {!guests.length ? <Empty>Ajoutez d’abord des invités.</Empty> : (
        <>
          {unplaced.length > 0 && (
            <div className="notice" style={{ marginBottom: 14 }}>
              <b>{plur(unplaced.length, "invitation")} sans table.</b>{" "}
              {write && <Link href={`${base}/placer`}>Placer les invités</Link>}
            </div>
          )}
          <div className="tables-grid">
            {tables.map((t) => (
              <Link key={t.n} href={`${base}/${t.n}`} className={"tcard tlink" + (t.used > t.cap || t.ghost ? " over" : t.free === 0 ? " full" : "")} aria-label={`Table ${t.n} : ${t.used} sur ${t.cap} places, ${t.free} libre(s). Voir le détail`}>
                <h3><span>Table {t.n}</span><span className="hint">{t.used}/{t.cap} · {t.free} libre{t.free > 1 ? "s" : ""}</span></h3>
                {t.ghost && <p className="hint" style={{ color: "var(--bad)" }}>Cette table n’existe plus : déplacez ses invités.</p>}
                {!t.guests.length ? <p className="hint">Table vide</p> : (
                  <div className="seats">{t.guests.map((g) => <span key={g.id} className="seat">{g.name}{g.kind !== "mr" && g.kind !== "mme" && <span className="hint"> · {kindHint(g)}</span>}</span>)}</div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
      {write && (
        <section className="card form" style={{ marginTop: 16 }}>
          <h2>Nombre de tables</h2>
          <div className="row">
            <ActionForm action={changeTables} hidden={{ event_id: id, op: "add" }} submit="+ Ajouter une table" />
            {ev.extra_tables > 0 && <ActionForm action={changeTables} hidden={{ event_id: id, op: "remove" }} submit="Retirer une table ajoutée" />}
          </div>
        </section>
      )}
      {write && guests.length > 0 && <TableFab href={`${base}/organiser`} />}
    </>
  );
}
