import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, Pager, StatusBadge, Stat } from "@/components/ui";
import { dateTime, money, month as monthLabel, METHOD_LABEL } from "@/lib/format";

type Tx = { reference: string; created_at: string; confirmed_at: string | null; amount_cents: number; currency: string; status: string; method: string; provider: string; persons: number; event: string | null; event_deleted: boolean; organizer: string | null };
type Summary = { revenue_cents: number; succeeded: number; pending: number; failed: number; refunded: number; refunded_cents: number };
type Month = { month: string; revenue_cents?: number; currency: string; tx_succeeded?: number; tx_refunded?: number; refunded_cents?: number; closed: boolean };
const STATUSES = [["", "Toutes"], ["succeeded", "Réussies"], ["pending", "En attente"], ["failed", "Échouées"], ["refunded", "Remboursées"]] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ status?: string; month?: string; q?: string; page?: string }> }) {
  const s = await requireAdmin("finance.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status || "" : "";
  const m = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month! : new Date().toISOString().slice(0, 7);
  const [r, rep] = await Promise.all([
    rpc<{ total: number; month: string; items: Tx[]; summary: Summary }>("admin_transactions", { p_status: status || null, p_month: m + "-01", p_search: (sp.q || "").slice(0, 80), p_page: page, p_size: 25 }),
    s.perms.has("reports.read") ? rpc<{ months: Month[] }>("admin_reports", { p_months: 24 }) : Promise.resolve(null),
  ]);
  const href = (o: Record<string, string | number>) => "/finance?" + new URLSearchParams(Object.entries({ status, month: m, q: sp.q || "", ...o }).filter(([, v]) => v !== "").map(([k, v]) => [k, String(v)])).toString();
  return (
    <>
      <PageHeader eyebrow="Finances" title={`Paiements · ${monthLabel(m + "-01")}`} sub="Le revenu ne compte que les paiements confirmés par le prestataire. Les événements offerts par l’administration n’y figurent jamais."
        actions={s.perms.has("reports.export") && (
          <form method="post" action="/api/export"><input type="hidden" name="kind" value="transactions" /><input type="hidden" name="month" value={m} /><button className="btn ghost sm" type="submit">Exporter le mois (CSV)</button></form>
        )} />
      {!r.ok ? <ErrorBox message={r.message} /> : (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <Stat label="Revenu confirmé" value={money(r.data.summary.revenue_cents)} sub={`${r.data.summary.succeeded} paiement(s) réussi(s)`} />
            <Stat label="En attente" value={r.data.summary.pending} sub="Non comptées" />
            <Stat label="Échouées" value={r.data.summary.failed} />
            <Stat label="Remboursées" value={r.data.summary.refunded} sub={money(r.data.summary.refunded_cents)} />
          </div>
          <form className="sticky-tools" role="search">
            <input type="hidden" name="status" value={status} />
            <input className="in" name="q" defaultValue={sp.q || ""} placeholder="Référence ou titre d’événement" aria-label="Rechercher" />
            <input className="in" type="month" name="month" defaultValue={m} aria-label="Mois" style={{ flex: "0 0 170px" }} />
            <button className="btn ghost" type="submit">Afficher</button>
          </form>
          <nav className="seg" aria-label="Statut" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            {STATUSES.map(([k, l]) => <Link key={k} href={href({ status: k, page: 1 })} aria-current={status === k ? "true" : undefined}>{l}</Link>)}
          </nav>
          {!r.data.items.length ? <Empty>Aucune transaction pour ce filtre.</Empty> : (
            <>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Référence</th><th className="hide-m">Date</th><th className="hide-m">Événement</th><th className="r">Montant</th><th className="hide-m">Moyen</th><th>Statut</th></tr></thead>
                <tbody>{r.data.items.map((t) => (
                  <tr key={t.reference}>
                    <td><code>{t.reference}</code><br /><span className="hint">{t.organizer || "—"}</span></td>
                    <td className="hide-m">{dateTime(t.created_at)}{t.confirmed_at && <><br /><span className="hint">confirmé {dateTime(t.confirmed_at)}</span></>}</td>
                    <td className="hide-m">{t.event || "—"}{t.event_deleted && <> <span className="badge">supprimé · preuve conservée</span></>}<br /><span className="hint">{t.persons} pers.</span></td>
                    <td className="r">{money(t.amount_cents, t.currency)}</td>
                    <td className="hide-m">{METHOD_LABEL[t.method] || t.method}<br /><span className="hint">{t.provider}</span></td>
                    <td><StatusBadge s={t.status} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <Pager page={page} size={25} total={r.data.total} href={(p) => href({ page: p })} />
            </>
          )}
        </>
      )}
      {rep && rep.ok && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: "1.35rem", marginBottom: 10 }}>Historique mensuel</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Mois</th><th className="r">Revenu confirmé</th><th className="r hide-m">Paiements</th><th className="r hide-m">Remboursé</th><th>État</th></tr></thead>
            <tbody>{rep.data.months.map((x) => (
              <tr key={x.month} className="link"><td><Link className="row-link" href={href({ month: x.month.slice(0, 7), page: 1 })}>{monthLabel(x.month)}</Link></td>
                <td className="r">{money(x.revenue_cents, x.currency)}</td><td className="r hide-m">{x.tx_succeeded ?? "—"}</td><td className="r hide-m">{money(x.refunded_cents, x.currency)}</td>
                <td>{x.closed ? <span className="badge gold">Clos · archivé</span> : <span className="badge">En cours</span>}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
