import Link from "next/link";
import { tableData, kindHint } from "@/lib/tables";
import { PageHeader, Notice } from "@/components/ui";
import { plur } from "@/lib/format";

/** Après le placement automatique : les tables et leurs invités, tels qu'enregistrés en base. */
export default async function AutoResult({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tables, unplaced, write } = await tableData(id);
  const placed = Math.max(0, Number(sp.placed) || 0);
  const base = `/events/${id}/tables`;
  return (
    <>
      <PageHeader eyebrow="Placement automatique" title="Tables et invités placés" actions={<Link className="btn ghost sm" href={base}>Retour aux tables</Link>} />
      <Notice tone="ok">Placement automatique terminé : {plur(placed, "invitation placée", "invitations placées")} et enregistrée{placed > 1 ? "s" : ""}.</Notice>
      {unplaced.length > 0 && (
        <div className="notice bad" role="alert" style={{ marginBottom: 14 }}>
          <b>{plur(unplaced.length, "invitation")} n’{unplaced.length > 1 ? "ont" : "a"} pas pu être placée{unplaced.length > 1 ? "s" : ""} faute de places disponibles.</b>
          <details style={{ marginTop: 6 }}>
            <summary>Voir les invités restants</summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{unplaced.map((g) => <li key={g.id}>{g.name} <span className="hint">· {kindHint(g)}</span></li>)}</ul>
          </details>
          {write && <div className="row" style={{ marginTop: 8 }}><Link className="btn sm" href={`${base}/manuel`}>Placement manuel</Link><Link className="btn ghost sm" href={base}>Ajouter une table</Link></div>}
        </div>
      )}
      <div className="tables-grid">
        {tables.map((t) => (
          <Link key={t.n} href={`${base}/${t.n}`} className={"tcard tlink" + (t.used > t.cap || t.ghost ? " over" : t.free === 0 ? " full" : "")}>
            <h3><span>Table {t.n}</span><span className="hint">{plur(t.guests.length, "invitation")}</span></h3>
            <p className="hint" style={{ margin: 0 }}>{t.used} / {t.cap} places · {t.free} disponible{t.free > 1 ? "s" : ""}</p>
            {!t.guests.length ? <p className="hint">Aucun invité</p> : <div className="seats">{t.guests.map((g) => <span key={g.id} className="seat">{g.name}{g.kind === "couple" && <span className="hint"> · couple</span>}</span>)}</div>}
          </Link>
        ))}
      </div>
    </>
  );
}
