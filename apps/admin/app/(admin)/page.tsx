import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, Stat, ErrorBox, Empty, StatusBadge } from "@/components/ui";
import { money, dateTime, month as monthLabel, METHOD_LABEL } from "@/lib/format";

type Dash = {
  events: { total: number; active: number; suspended: number; this_month: number; free_admin: number };
  organizers: { total: number; suspended: number; this_month: number };
  finance: null | { month: string; revenue_cents: number; succeeded: number; pending: number; currency: string; pending_list: { reference: string; amount_cents: number; currency: string; method: string; created_at: string; event: string }[] };
  activity: null | { at: string; actor_label: string; action: string; object_type: string; object_id: string; result: string }[];
  alerts: null | { failed_admin_logins_24h: number; denied_actions_24h: number; locked_staff: number; recent: { at: string; actor_label: string; action: string }[] };
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin("dashboard.read");
  const { e } = await searchParams;
  const r = await rpc<Dash>("admin_dashboard");
  return (
    <>
      <PageHeader eyebrow="Vue d’ensemble" title="Tableau de bord" sub="Données en temps réel de la plateforme." />
      {e === "forbidden" && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>Cette page n’est pas accessible avec votre rôle.</div>}
      {!r.ok ? <ErrorBox message={r.message} /> : (
        <div className="grid" style={{ gap: 18 }}>
          <div className="grid g4">
            <Stat label="Événements actifs" value={r.data.events.active} sub={`${r.data.events.total} au total · ${r.data.events.this_month} ce mois`} />
            <Stat label="Organisateurs" value={r.data.organizers.total} sub={`${r.data.organizers.this_month} inscrits ce mois · ${r.data.organizers.suspended} suspendu(s)`} />
            {r.data.finance ? (
              <>
                <Stat label="Paiements confirmés du mois" value={money(r.data.finance.revenue_cents, r.data.finance.currency)} sub={`${r.data.finance.succeeded} transaction(s) · ${monthLabel(r.data.finance.month)}`} />
                <Stat label="Transactions en attente" value={r.data.finance.pending} sub="Non comptées dans le revenu" />
              </>
            ) : (
              <>
                <Stat label="Événements gratuits (admin)" value={r.data.events.free_admin} sub="Jamais comptés comme ventes" />
                <Stat label="Événements suspendus" value={r.data.events.suspended} />
              </>
            )}
          </div>
          <div className="grid g2">
            {r.data.finance && (
              <section className="card">
                <h2>Transactions en attente</h2>
                {r.data.finance.pending_list.length ? (
                  <table className="tbl"><tbody>{r.data.finance.pending_list.map((t) => (
                    <tr key={t.reference}><td><b>{t.reference}</b><br /><span className="hint">{t.event}</span></td><td>{METHOD_LABEL[t.method]}</td><td className="r">{money(t.amount_cents, t.currency)}</td></tr>
                  ))}</tbody></table>
                ) : <Empty>Aucune transaction en attente.</Empty>}
                <p style={{ marginTop: 10 }}><Link className="btn ghost sm" href="/finance?status=pending">Voir les finances</Link></p>
              </section>
            )}
            {r.data.alerts && (
              <section className="card">
                <h2>Alertes de sécurité</h2>
                <div className="grid g3" style={{ marginBottom: 12 }}>
                  <div className="stat"><b>{r.data.alerts.failed_admin_logins_24h}</b><span>Connexions admin échouées (24 h)</span></div>
                  <div className="stat"><b>{r.data.alerts.denied_actions_24h}</b><span>Actions refusées (24 h)</span></div>
                  <div className="stat"><b>{r.data.alerts.locked_staff}</b><span>Accès du jour J bloqués</span></div>
                </div>
                {r.data.alerts.recent.length ? (
                  <table className="tbl"><tbody>{r.data.alerts.recent.map((a, i) => (
                    <tr key={i}><td>{dateTime(a.at)}</td><td>{a.actor_label}</td><td>{a.action}</td><td><StatusBadge s="denied" /></td></tr>
                  ))}</tbody></table>
                ) : <Empty>Aucune alerte récente.</Empty>}
              </section>
            )}
          </div>
          {r.data.activity && (
            <section className="card">
              <h2>Dernières activités</h2>
              {r.data.activity.length ? (
                <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Auteur</th><th>Opération</th><th>Objet</th><th>Résultat</th></tr></thead><tbody>
                  {r.data.activity.map((a, i) => (
                    <tr key={i}><td>{dateTime(a.at)}</td><td>{a.actor_label}</td><td>{a.action}</td><td className="hint">{a.object_type} {a.object_id?.slice(0, 8)}</td><td><StatusBadge s={a.result} /></td></tr>
                  ))}
                </tbody></table></div>
              ) : <Empty>Aucune activité enregistrée.</Empty>}
            </section>
          )}
        </div>
      )}
    </>
  );
}
