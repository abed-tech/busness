import Link from "next/link";
import { notFound } from "next/navigation";
import { tableData, kindHint } from "@/lib/tables";
import { PageHeader, Notice, Stat } from "@/components/ui";
import { plur } from "@/lib/format";

/** Détail d'une table, lu en base : invités assis, places occupées, capacité, places restantes. */
export default async function TableDetail({ params, searchParams }: { params: Promise<{ id: string; n: string }>; searchParams: Promise<{ moved?: string }> }) {
  const { id, n } = await params;
  const sp = await searchParams;
  if (!/^\d{1,4}$/.test(n)) notFound();
  const { tables, guests, write } = await tableData(id);
  const t = tables.find((x) => x.n === Number(n));
  if (!t) notFound();
  const base = `/events/${id}/tables`;
  const moved = guests.find((g) => g.id === sp.moved && g.table_no === t.n);
  return (
    <>
      <PageHeader eyebrow="Tables" title={`Table ${t.n}`} actions={<Link className="btn ghost sm" href={base}>Toutes les tables</Link>} />
      {moved && <Notice tone="ok">{moved.name} déplacé(e) avec succès à la table {t.n}.</Notice>}
      {t.ghost && <Notice tone="bad">Cette table n’existe plus (moins de tables qu’avant) : déplacez ses invités vers une autre table.</Notice>}
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat label="Invités" value={t.guests.length} sub={plur(t.used, "personne")} />
        <Stat label="Capacité" value={t.cap} sub="places" />
        <Stat label="Places restantes" value={t.free} sub={t.free === 0 ? "table complète" : undefined} />
      </div>
      <section className="card form">
        <h2>Invités de la table {t.n}</h2>
        {!t.guests.length ? <p className="hint">Aucun invité n’est encore assis à cette table.</p> : (
          <div className="list">
            {t.guests.map((g) => (
              <div key={g.id} className="li" style={{ justifyContent: "space-between" }}>
                <span style={{ minWidth: 0 }}><b>{g.name}</b><small className="hint" style={{ display: "block" }}>{kindHint(g)}{g.placed_manually ? " · placé à la main" : ""}{g.rsvp === "yes" ? " · présence confirmée" : g.rsvp === "no" ? " · ne vient pas" : ""}</small></span>
                {write && <Link className="btn ghost sm" href={`${base}/manuel/${g.id}?move=1`}>Déplacer</Link>}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
