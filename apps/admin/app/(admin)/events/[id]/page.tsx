import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, StatusBadge, Stat, Bar } from "@/components/ui";
import { ConfirmAction } from "@/components/ConfirmAction";
import { date, money, ORIGIN_LABEL, TYPE_LABEL } from "@/lib/format";
import { setStatus } from "../actions";

type Stats = { invitations: number; persons: number; confirmed_persons: number; tables: number; presence: { persons: number; invitations: number };
  drinks: { planned: number; served: number; by_table: { table: number; planned: number; served: number }[] };
  dishes: { planned: number; served: number; by_table: { table: number; planned: number; served: number }[] } };
type Account = { id: string; username: string; status: string };
type Detail = { event: Record<string, any>; owner: Account | null; organizer: Account | null; stats: Stats; paid_cents: number | null; staff: { controllers: number; servers: number; revoked: number } };

const TABS = [["overview", "Aperçu"], ["tracking", "Suivis"]] as const;

/**
 * Fiche d'un événement : métadonnées et totaux uniquement. Les invités, les invitations et leur contenu
 * restent privés à l'organisateur ; la base ne les transmet à aucun administrateur.
 */
export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const s = await requireAdmin("events.read");
  const { id } = await params;
  const sp = await searchParams;
  const r = await rpc<Detail>("admin_event_detail", { p_event: id });
  if (!r.ok) return <ErrorBox message={r.message} />;
  const { event: e, stats, staff } = r.data;
  const tab = (TABS.some(([k]) => k === sp.tab) ? sp.tab : "overview") as string;
  const deleted = e.status === "deleted";
  const account = r.data.owner || r.data.organizer;

  return (
    <>
      <PageHeader eyebrow={`${TYPE_LABEL[e.type]} · ${ORIGIN_LABEL[e.origin]}${e.billing === "free_admin" ? " · gratuit" : ""}`} title={e.title}
        sub={<>{date(e.event_date)} · {e.venue} · <StatusBadge s={e.status} /></>}
        actions={!deleted && s.perms.has("events.suspend") && (e.status === "active"
          ? <ConfirmAction action={setStatus} label="Suspendre" title="Suspendre l’événement ?" body="Les invitations et les accès du jour J seront bloqués, et l’organisateur passera en lecture seule. Le motif est obligatoire et l’action est journalisée." confirmLabel="Suspendre" needReason hidden={{ event_id: id, status: "suspended" }} />
          : e.status === "suspended" ? <ConfirmAction action={setStatus} label="Réactiver" title="Réactiver l’événement ?" body="Les invitations et les accès redeviennent utilisables." confirmLabel="Réactiver" hidden={{ event_id: id, status: "active" }} /> : null)} />
      {sp.created && <div className="notice ok" style={{ marginBottom: 14 }}>Événement offert créé : aucune transaction ni revenu n’a été enregistré. L’organisateur le complète et le gère depuis son espace.</div>}
      {e.status === "suspended" && <div className="notice bad" style={{ marginBottom: 14 }}>Événement suspendu : {e.status_reason}</div>}
      <p className="hint" style={{ marginBottom: 14 }}>Confidentialité : les invités, les invitations et leur contenu ne sont accessibles qu’à l’organisateur. Aucun administrateur ne peut les consulter, modifier ou supprimer l’événement.</p>

      <nav className="seg" aria-label="Sections" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => <Link key={k} href={`/events/${id}?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}
      </nav>

      {tab === "overview" && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="grid g4">
            <Stat label="Invitations" value={stats.invitations} sub={`${stats.persons} personne(s)`} />
            <Stat label="Personnes attendues" value={e.expected} sub={`${stats.tables} table(s) de ${e.table_capacity}`} />
            <Stat label="Présents" value={stats.presence.persons} sub={`${stats.confirmed_persons} confirmé(s)`} />
            {r.data.paid_cents != null ? <Stat label="Payé" value={money(r.data.paid_cents)} sub={e.billing === "free_admin" ? "Événement gratuit (admin)" : "Paiements confirmés"} /> : <Stat label="Accès du jour J" value={staff.controllers + staff.servers} />}
          </div>
          <div className="grid g2">
            <section className="card"><h2>Informations</h2>
              <dl className="kv">
                <dt>Identifiant</dt><dd>{e.short_id}</dd>
                <dt>Date</dt><dd>{date(e.event_date)}</dd>
                <dt>Lieu</dt><dd>{e.venue}</dd>
                <dt>Menu proposé</dt><dd>{({ both: "Boissons et plats", drinks: "Boissons", food: "Plats", none: "Aucun" } as Record<string, string>)[e.offer]}</dd>
                <dt>Créé le</dt><dd>{date(e.created_at)}</dd>
              </dl>
            </section>
            <section className="card"><h2>Organisateur</h2>
              {account ? (
                <dl className="kv">
                  <dt>Compte</dt><dd>{s.perms.has("organizers.read") ? <Link href={`/organizers/${account.id}`}>{account.username}</Link> : account.username}</dd>
                  <dt>Relation</dt><dd>{r.data.owner ? "Propriétaire" : `Associé (événement offert${e.organizer_can_manage ? ", gestion autorisée" : ", consultation"})`}</dd>
                  <dt>Statut</dt><dd><StatusBadge s={account.status} /></dd>
                </dl>) : <Empty>Événement de la plateforme, sans organisateur.</Empty>}
            </section>
          </div>
          <section className="card"><h2>Accès du jour J</h2>
            {staff.controllers + staff.servers + staff.revoked ? (
              <div className="row">
                <span className="badge gold">{staff.controllers} contrôleur(s)</span>
                <span className="badge gold">{staff.servers} serveur(s)</span>
                {staff.revoked > 0 && <span className="badge bad">{staff.revoked} révoqué(s)</span>}
              </div>) : <Empty>Aucun contrôleur ni serveur.</Empty>}
          </section>
        </div>
      )}

      {tab === "tracking" && (
        <div className="grid g3">
          <section className="card"><h2>Suivi de présence</h2><p className="stat"><b>{stats.presence.persons}</b><span>personnes présentes sur {stats.confirmed_persons} confirmées</span></p><Bar value={stats.presence.persons} max={stats.confirmed_persons} /></section>
          {(["drinks", "dishes"] as const).map((k) => (
            <section key={k} className="card"><h2>{k === "drinks" ? "Suivi boissons" : "Suivi plats"}</h2>
              <p className="stat"><b>{stats[k].served}/{stats[k].planned}</b><span>{k === "drinks" ? "boissons servies" : "plats servis"}</span></p>
              <Bar value={stats[k].served} max={stats[k].planned} />
              <table className="tbl" style={{ marginTop: 10 }}><tbody>{stats[k].by_table.map((t) => <tr key={t.table}><td>{t.table ? "Table " + t.table : "Sans table"}</td><td className="r">{t.served}/{t.planned}</td></tr>)}</tbody></table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
