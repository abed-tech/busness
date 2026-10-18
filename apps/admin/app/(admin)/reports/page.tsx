import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, Stat, Bar } from "@/components/ui";
import { money, month as monthLabel } from "@/lib/format";

type Month = { month: string; currency: string; revenue_cents?: number; tx_succeeded?: number; tx_pending?: number; tx_failed?: number; tx_refunded?: number; refunded_cents?: number;
  events_created: number; events_free_admin: number; organizers_new: number; closed: boolean };

export default async function ReportsPage() {
  const s = await requireAdmin("reports.read");
  const r = await rpc<{ months: Month[]; finance: boolean }>("admin_reports", { p_months: 24 });
  if (!r.ok) return <ErrorBox message={r.message} />;
  const { months, finance } = r.data;
  const cur = months[0];
  const maxEv = Math.max(1, ...months.map((x) => x.events_created));
  const maxRev = Math.max(1, ...months.map((x) => x.revenue_cents || 0));
  return (
    <>
      <PageHeader eyebrow="Rapports" title="Rapports mensuels" sub="Chaque mois écoulé est clos automatiquement et archivé : ses chiffres ne changent plus."
        actions={s.perms.has("reports.export") && (
          <form method="post" action="/api/export"><input type="hidden" name="kind" value="monthly" /><button className="btn ghost sm" type="submit">Exporter (CSV)</button></form>
        )} />
      {!months.length ? <Empty>Aucune donnée.</Empty> : (
        <>
          {cur && (
            <div className="grid g4" style={{ marginBottom: 16 }}>
              <Stat label="Événements créés ce mois" value={cur.events_created} sub={`dont ${cur.events_free_admin} offert(s) par l’administration`} />
              <Stat label="Nouveaux organisateurs" value={cur.organizers_new} />
              {finance ? <>
                <Stat label="Revenu confirmé" value={money(cur.revenue_cents, cur.currency)} sub={`${cur.tx_succeeded} paiement(s)`} />
                <Stat label="Échecs · remboursements" value={`${cur.tx_failed} · ${cur.tx_refunded}`} sub={`${cur.tx_pending} en attente`} />
              </> : <div className="card hint" style={{ gridColumn: "span 2" }}>Les chiffres financiers ne sont pas visibles avec votre rôle.</div>}
            </div>
          )}
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Mois</th><th>Événements</th><th className="hide-m">Offerts</th><th className="hide-m">Organisateurs</th>{finance && <><th className="r">Revenu</th><th className="r hide-m">Réussis</th><th className="r hide-m">Échoués</th><th className="r hide-m">Remboursés</th></>}<th>État</th></tr></thead>
            <tbody>{months.map((x) => (
              <tr key={x.month}>
                <td><b>{monthLabel(x.month)}</b></td>
                <td style={{ minWidth: 120 }}>{x.events_created}<Bar value={x.events_created} max={maxEv} /></td>
                <td className="hide-m">{x.events_free_admin}</td>
                <td className="hide-m">{x.organizers_new}</td>
                {finance && <>
                  <td className="r" style={{ minWidth: 120 }}>{money(x.revenue_cents, x.currency)}<Bar value={x.revenue_cents || 0} max={maxRev} /></td>
                  <td className="r hide-m">{x.tx_succeeded}</td><td className="r hide-m">{x.tx_failed}</td><td className="r hide-m">{x.tx_refunded}</td>
                </>}
                <td>{x.closed ? <span className="badge gold">Clos</span> : <span className="badge">En cours</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </>
  );
}
