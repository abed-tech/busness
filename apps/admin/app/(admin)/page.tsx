import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, Stat, ErrorBox, Empty, StatusBadge } from "@/components/ui";
import { MonthBars } from "@/components/Chart";
import { money, dateTime, month as monthLabel, shortMonth, METHOD_LABEL } from "@/lib/format";

type Dash = {
  events: { total: number; active: number; suspended: number; this_month: number; free_admin: number; drafts: number; deleted_kept: number };
  organizers: { total: number; suspended: number; this_month: number };
  finance: null | { month: string; revenue_cents: number; succeeded: number; pending: number; currency: string; pending_list: { reference: string; amount_cents: number; currency: string; method: string; created_at: string; event: string }[] };
  series: { month: string; events: number; organizers: number; revenue_cents: number | null }[];
  activity: null | { at: string; actor_label: string; action: string; object_type: string; object_id: string; result: string }[];
  alerts: null | { failed_admin_logins_24h: number; denied_actions_24h: number; locked_staff: number; recent: { at: string; actor_label: string; action: string }[] };
};

/** Couleurs des graphiques (une série chacun), validées sur la surface sombre : contraste ≥ 3:1. */
const REVENUE = "#b98c33", ACTIVITY = "#5b8fe0";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdmin("dashboard.read");
  const { e } = await searchParams;
  const r = await rpc<Dash>("admin_dashboard");
  if (!r.ok) return <><PageHeader eyebrow="Vue d’ensemble" title="Tableau de bord" /><ErrorBox message={r.message} /></>;
  const d = r.data;
  const cur = d.finance?.currency || "USD";
  const series = d.series || [];
  return (
    <>
      <PageHeader eyebrow="Vue d’ensemble" title="Tableau de bord" sub="Données en temps réel de la plateforme Skyevenapp." />
      {e === "forbidden" && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>Cette page n’est pas accessible avec votre rôle.</div>}
      <div className="grid" style={{ gap: 18 }}>
        <div className="grid g4">
          <Stat icon="events" label="Événements actifs" value={d.events.active} sub={`${d.events.total} au total · ${d.events.this_month} créé(s) ce mois`} />
          <Stat icon="users" label="Organisateurs" value={d.organizers.total} sub={`${d.organizers.this_month} inscrit(s) ce mois · ${d.organizers.suspended} suspendu(s)`} />
          {d.finance ? (
            <>
              <Stat icon="money" label="Revenu confirmé du mois" value={money(d.finance.revenue_cents, cur)} sub={`${d.finance.succeeded} paiement(s) · ${monthLabel(d.finance.month)}`} />
              <Stat icon="clock" label="Paiements en attente" value={d.finance.pending} sub="Non comptés dans le revenu" />
            </>
          ) : (
            <>
              <Stat icon="events" label="Événements offerts (admin)" value={d.events.free_admin} sub="Jamais comptés comme ventes" />
              <Stat icon="clock" label="Événements suspendus" value={d.events.suspended} />
            </>
          )}
        </div>

        <div className="grid g2">
          {d.finance && (
            <section className="card">
              <div className="card-h"><h2>Revenus confirmés</h2><span className="hint">12 derniers mois · {cur}</span></div>
              <MonthBars title="Revenu confirmé" color={REVENUE} axis={(v) => money(Math.round(v), cur)}
                points={series.map((s) => ({ label: shortMonth(s.month), full: monthLabel(s.month), value: s.revenue_cents || 0, display: money(s.revenue_cents || 0, cur) }))} />
            </section>
          )}
          <section className="card">
            <div className="card-h"><h2>Événements créés</h2><span className="hint">après paiement confirmé · 12 derniers mois</span></div>
            <MonthBars title="Événements créés" color={ACTIVITY} axis={(v) => String(Math.round(v))}
              points={series.map((s) => ({ label: shortMonth(s.month), full: monthLabel(s.month), value: s.events, display: String(s.events) }))} />
          </section>
        </div>

        <div className="grid g4">
          <Stat icon="draft" label="Créations non payées" value={d.events.drafts} sub={<Link href="/events?status=draft">Brouillons, jamais actifs</Link>} />
          <Stat icon="archive" label="Événements supprimés (historique)" value={d.events.deleted_kept} sub={<Link href="/history">Statistiques conservées</Link>} />
          <Stat icon="events" label="Événements suspendus" value={d.events.suspended} />
          <Stat icon="users" label="Nouveaux organisateurs (mois)" value={d.organizers.this_month} />
        </div>

        <div className="grid g2">
          {d.finance && (
            <section className="card">
              <h2>Paiements en attente</h2>
              {d.finance.pending_list.length ? (
                <div className="tbl-wrap"><table className="tbl"><tbody>{d.finance.pending_list.map((t) => (
                  <tr key={t.reference}><td><b>{t.reference}</b><br /><span className="hint">{t.event}</span></td><td>{METHOD_LABEL[t.method] || t.method}</td><td className="r">{money(t.amount_cents, t.currency)}</td></tr>
                ))}</tbody></table></div>
              ) : <Empty>Aucun paiement en attente.</Empty>}
              <p style={{ marginTop: 10 }}><Link className="btn ghost sm" href="/finance?status=pending">Voir les finances</Link></p>
            </section>
          )}
          {d.alerts && (
            <section className="card">
              <h2>Alertes de sécurité</h2>
              <div className="grid g3" style={{ marginBottom: 12 }}>
                <div className="stat mini"><b>{d.alerts.failed_admin_logins_24h}</b><span>Connexions admin échouées (24 h)</span></div>
                <div className="stat mini"><b>{d.alerts.denied_actions_24h}</b><span>Actions refusées (24 h)</span></div>
                <div className="stat mini"><b>{d.alerts.locked_staff}</b><span>Accès du jour J bloqués</span></div>
              </div>
              {d.alerts.recent.length ? (
                <div className="tbl-wrap"><table className="tbl"><tbody>{d.alerts.recent.map((a, i) => (
                  <tr key={i}><td>{dateTime(a.at)}</td><td>{a.actor_label}</td><td>{a.action}</td><td><StatusBadge s="denied" /></td></tr>
                ))}</tbody></table></div>
              ) : <Empty>Aucune alerte récente.</Empty>}
            </section>
          )}
        </div>
        {d.activity && (
          <section className="card">
            <h2>Dernières activités</h2>
            {d.activity.length ? (
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Date</th><th>Auteur</th><th>Opération</th><th className="hide-m">Objet</th><th>Résultat</th></tr></thead><tbody>
                {d.activity.map((a, i) => (
                  <tr key={i}><td>{dateTime(a.at)}</td><td>{a.actor_label}</td><td>{a.action}</td><td className="hint hide-m">{a.object_type} {a.object_id?.slice(0, 8)}</td><td><StatusBadge s={a.result} /></td></tr>
                ))}
              </tbody></table></div>
            ) : <Empty>Aucune activité enregistrée.</Empty>}
            <p style={{ marginTop: 10 }}><Link className="btn ghost sm" href="/audit">Ouvrir le journal</Link></p>
          </section>
        )}
      </div>
    </>
  );
}
