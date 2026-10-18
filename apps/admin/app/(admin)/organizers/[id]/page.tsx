import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, StatusBadge } from "@/components/ui";
import { ConfirmAction } from "@/components/ConfirmAction";
import { date, dateTime, money, ORIGIN_LABEL, METHOD_LABEL } from "@/lib/format";
import { setOrganizerStatus } from "../actions";

type Detail = {
  profile: { id: string; username: string; full_name: string | null; email: string | null; phone: string | null; status: string; status_reason: string | null; status_changed_at: string | null; created_at: string } | null;
  events: { id: string; title: string; date: string; status: string; origin: string; billing: string }[];
  payments: { reference: string; amount_cents: number; currency: string; status: string; method: string; created_at: string; confirmed_at: string | null }[] | null;
};

export default async function OrganizerDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin("organizers.read");
  const { id } = await params;
  const r = await rpc<Detail>("admin_organizer_detail", { p_user: id });
  if (!r.ok) return <ErrorBox message={r.message} />;
  const { profile: p, events, payments } = r.data;
  if (!p) return <ErrorBox message="Organisateur introuvable." />;
  return (
    <>
      <PageHeader eyebrow="Organisateur" title={p.username} sub={<>Inscrit le {date(p.created_at)} · <StatusBadge s={p.status} /></>}
        actions={<>
          <Link className="btn ghost sm" href="/organizers">Tous les organisateurs</Link>
          {s.perms.has("organizers.suspend") && (p.status === "active"
            ? <ConfirmAction action={setOrganizerStatus} label="Suspendre le compte" title="Suspendre ce compte ?" body="L’organisateur pourra encore consulter ses événements mais ne pourra plus rien modifier ni payer. L’action est journalisée." confirmLabel="Suspendre" needReason hidden={{ user_id: p.id, status: "suspended" }} />
            : <ConfirmAction action={setOrganizerStatus} label="Réactiver le compte" title="Réactiver ce compte ?" body="L’organisateur retrouve l’accès complet à ses événements." confirmLabel="Réactiver" hidden={{ user_id: p.id, status: "active" }} />)}
        </>} />
      {p.status === "suspended" && <div className="notice bad" style={{ marginBottom: 14 }}>Suspendu le {dateTime(p.status_changed_at)} : {p.status_reason}</div>}
      <div className="grid g2" style={{ marginBottom: 16 }}>
        <section className="card"><h2>Coordonnées</h2>
          <dl className="kv"><dt>Nom complet</dt><dd>{p.full_name || "—"}</dd><dt>E-mail</dt><dd>{p.email || "—"}</dd><dt>Téléphone</dt><dd>{p.phone || "—"}</dd><dt>Inscription</dt><dd>{date(p.created_at)}</dd></dl>
        </section>
        <section className="card"><h2>Activité</h2>
          <dl className="kv"><dt>Événements</dt><dd>{events.length}</dd>
            {payments && <><dt>Paiements confirmés</dt><dd>{payments.filter((x) => x.status === "succeeded").length} · {money(payments.filter((x) => x.status === "succeeded").reduce((a, x) => a + x.amount_cents, 0))}</dd></>}
          </dl>
        </section>
      </div>
      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: "1.35rem", marginBottom: 10 }}>Événements</h2>
        {!events.length ? <Empty>Aucun événement.</Empty> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Événement</th><th className="hide-m">Date</th><th className="hide-m">Origine</th><th>Statut</th></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id} className="link"><td><Link className="row-link" href={`/events/${e.id}`}><b>{e.title}</b></Link></td>
                <td className="hide-m">{date(e.date)}</td><td className="hide-m">{ORIGIN_LABEL[e.origin]}{e.billing === "free_admin" && " · gratuit"}</td><td><StatusBadge s={e.status} /></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {payments && (
        <section>
          <h2 style={{ fontSize: "1.35rem", marginBottom: 10 }}>Historique des paiements</h2>
          {!payments.length ? <Empty>Aucun paiement.</Empty> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Référence</th><th className="hide-m">Date</th><th className="r">Montant</th><th className="hide-m">Moyen</th><th>Statut</th></tr></thead>
              <tbody>{payments.map((t) => (
                <tr key={t.reference}><td><code>{t.reference}</code></td><td className="hide-m">{dateTime(t.created_at)}</td><td className="r">{money(t.amount_cents, t.currency)}</td><td className="hide-m">{METHOD_LABEL[t.method] || t.method}</td><td><StatusBadge s={t.status} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}
    </>
  );
}
