import { notFound } from "next/navigation";
import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent } from "@/lib/event";
import { PageHeader, Empty, Bar, Notice } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { offersDrinks, offersFood } from "@/lib/format";

type Part = { planned: number; served: number; by_table: { table: number; planned: number; served: number }[] };

export default async function Tracking({ params }: { params: Promise<{ id: string; kind: string }> }) {
  await requireOrganizer();
  const { id, kind } = await params;
  if (kind !== "drinks" && kind !== "dishes") notFound();
  const ev = await loadEvent(id);
  const st = await rpc<{ drinks: Part; dishes: Part }>("event_stats", { p_event: id });
  const d = kind === "drinks";
  const p = st.ok ? st.data[kind] : null;
  const offered = d ? offersDrinks(ev.offer) : offersFood(ev.offer);
  return (
    <>
      <PageHeader eyebrow="Jour J" title={d ? "Suivi boissons" : "Suivi plats"} sub="Une prestation est comptée quand un serveur la valide en scannant le QR code de l’invité." />
      {!offered && <Notice>Les invités ne choisissent pas {d ? "de boisson" : "de plat"} pour cet événement.</Notice>}
      {p && (
        <>
          <div className="big3" style={{ marginBottom: 10 }}>
            <div><b>{p.planned}</b><span>{d ? "Prévues" : "Prévus"}</span></div>
            <div><b>{p.served}</b><span>{d ? "Servies" : "Servis"}</span></div>
            <div><b>{Math.max(0, p.planned - p.served)}</b><span>{d ? "Restantes" : "Restants"}</span></div>
          </div>
          <Bar value={p.served} max={p.planned} />
          <AutoRefresh seconds={5} />
          {!p.by_table.length ? <Empty>Aucune commande confirmée.</Empty> : (
            <div className="tables-grid" style={{ marginTop: 14 }}>
              {p.by_table.map((t) => (
                <section key={t.table} className={"tcard" + (t.served >= t.planned ? " full" : "")}>
                  <h3><span>{t.table ? `Table ${t.table}` : "Sans table"}</span><span className="hint">{t.served}/{t.planned}</span></h3>
                  <Bar value={t.served} max={t.planned} />
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
