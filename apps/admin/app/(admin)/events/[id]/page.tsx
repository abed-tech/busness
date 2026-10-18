import Link from "next/link";
import QRCode from "qrcode";
import { loads, tableCount, KIND_LABEL, type Guest } from "@ceremonia/core";
import { requireAdmin, rpc } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { PageHeader, ErrorBox, Empty, StatusBadge, Stat, Bar, Pager } from "@/components/ui";
import { ConfirmAction } from "@/components/ConfirmAction";
import { date, money, ORIGIN_LABEL, TYPE_LABEL } from "@/lib/format";
import { setStatus, deleteEvent, autoAssignAction } from "../actions";
import { GuestAdd } from "./GuestAdd";
import { ActionForm } from "./ActionForm";

type Stats = { invitations: number; persons: number; confirmed_persons: number; tables: number; presence: { persons: number; invitations: number };
  drinks: { planned: number; served: number; by_table: { table: number; planned: number; served: number }[] };
  dishes: { planned: number; served: number; by_table: { table: number; planned: number; served: number }[] } };
type Detail = { event: Record<string, any>; owner: Record<string, any> | null; organizer: Record<string, any> | null; stats: Stats; paid_cents: number | null; staff: { role: string; name: string; revoked: boolean }[] };

const TABS = [["overview", "Aperçu"], ["guests", "Invités"], ["tables", "Tables"], ["tracking", "Suivis"], ["invitations", "Invitations"]] as const;

export default async function EventDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string }> }) {
  const s = await requireAdmin("events.read");
  const { id } = await params;
  const sp = await searchParams;
  const r = await rpc<Detail>("admin_event_detail", { p_event: id });
  if (!r.ok) return <ErrorBox message={r.message} />;
  const { event: e, stats } = r.data;
  const canGuests = s.perms.has("guests.read");
  const tab = (TABS.some(([k]) => k === sp.tab) ? sp.tab : "overview") as string;
  const sb = await serverClient();
  let guests: (Guest & { rsvp: string | null; invite_token: string; code: string })[] = [];
  if (canGuests && tab !== "overview" && tab !== "tracking") {
    const { data } = await sb.from("guests").select("id, name, kind, table_no, placed_manually, whatsapp, rsvp, invite_token, code").eq("event_id", id).order("sort_order");
    guests = (data || []) as typeof guests;
  }
  const evShape = { table_capacity: e.table_capacity, expected: e.expected, extra_tables: e.extra_tables };
  const deleted = e.status === "deleted";

  return (
    <>
      <PageHeader eyebrow={`${TYPE_LABEL[e.type]} · ${ORIGIN_LABEL[e.origin]}${e.billing === "free_admin" ? " · gratuit" : ""}`} title={e.title}
        sub={<>{date(e.event_date)} · {e.venue} · <StatusBadge s={e.status} /></>}
        actions={!deleted && <>
          {s.perms.has("events.write") && <Link className="btn ghost sm" href={`/events/${id}/edit`}>Modifier</Link>}
          {s.perms.has("events.suspend") && (e.status === "active"
            ? <ConfirmAction action={setStatus} label="Suspendre" title="Suspendre l’événement ?" body="Les invitations et les accès du jour J seront bloqués, et l’organisateur passera en lecture seule. L’action est journalisée." confirmLabel="Suspendre" needReason hidden={{ event_id: id, status: "suspended" }} />
            : <ConfirmAction action={setStatus} label="Réactiver" title="Réactiver l’événement ?" body="Les invitations et les accès redeviennent utilisables." confirmLabel="Réactiver" hidden={{ event_id: id, status: "active" }} />)}
          {s.perms.has("events.delete") && <ConfirmAction action={deleteEvent} danger label="Supprimer" title="Supprimer les données de l’événement ?" body="Les invités, tables, commandes, accès et suivis seront supprimés définitivement. Les transactions, preuves de paiement et le journal sont conservés." confirmLabel="Supprimer définitivement" needText={e.title} hidden={{ event_id: id }} />}
        </>} />
      {sp.created && <div className="notice ok" style={{ marginBottom: 14 }}>Événement créé gratuitement : aucune transaction ni revenu n’a été enregistré.</div>}
      {sp.updated && <div className="notice ok" style={{ marginBottom: 14 }}>Modifications enregistrées.</div>}
      {e.status === "suspended" && <div className="notice bad" style={{ marginBottom: 14 }}>Événement suspendu : {e.status_reason}</div>}

      <nav className="seg" aria-label="Sections" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.filter(([k]) => canGuests || k === "overview" || k === "tracking").map(([k, l]) => <Link key={k} href={`/events/${id}?tab=${k}`} aria-current={tab === k ? "true" : undefined}>{l}</Link>)}
      </nav>

      {tab === "overview" && (
        <div className="grid" style={{ gap: 16 }}>
          <div className="grid g4">
            <Stat label="Invitations" value={stats.invitations} sub={`${stats.persons} personne(s)`} />
            <Stat label="Personnes attendues" value={e.expected} sub={`${stats.tables} table(s) de ${e.table_capacity}`} />
            <Stat label="Présents" value={stats.presence.persons} sub={`${stats.confirmed_persons} confirmé(s)`} />
            {r.data.paid_cents != null ? <Stat label="Payé" value={money(r.data.paid_cents)} sub={e.billing === "free_admin" ? "Événement gratuit (admin)" : "Paiements confirmés"} /> : <Stat label="Accès du jour J" value={r.data.staff.length} />}
          </div>
          <div className="grid g2">
            <section className="card"><h2>Informations</h2>
              <dl className="kv">
                <dt>Identifiant</dt><dd>{e.short_id}</dd>
                <dt>Date et heure</dt><dd>{date(e.event_date)} à {String(e.event_time).slice(0, 5)}</dd>
                <dt>Lieu</dt><dd>{e.venue}, {e.address}</dd>
                <dt>Menu proposé</dt><dd>{({ both: "Boissons et plats", drinks: "Boissons", food: "Plats", none: "Aucun" } as Record<string, string>)[e.offer]}</dd>
                <dt>Créé le</dt><dd>{date(e.created_at)}</dd>
              </dl>
            </section>
            <section className="card"><h2>Organisateur</h2>
              {r.data.owner || r.data.organizer ? (() => { const o = (r.data.owner || r.data.organizer)!; return (
                <dl className="kv">
                  <dt>Compte</dt><dd>{s.perms.has("organizers.read") ? <Link href={`/organizers/${o.id}`}>{o.username}</Link> : o.username}</dd>
                  <dt>Relation</dt><dd>{r.data.owner ? "Propriétaire" : `Associé (événement offert${e.organizer_can_manage ? ", gestion autorisée" : ", consultation"})`}</dd>
                  <dt>Contact</dt><dd>{o.email || "—"} {o.phone ? " · " + o.phone : ""}</dd>
                  <dt>Statut</dt><dd><StatusBadge s={o.status} /></dd>
                </dl>); })() : <Empty>Événement de la plateforme, sans organisateur.</Empty>}
            </section>
          </div>
          <section className="card"><h2>Accès du jour J</h2>
            {r.data.staff.length ? <div className="row">{r.data.staff.map((x, i) => <span key={i} className={"badge " + (x.revoked ? "bad" : "gold")}>{x.role === "controller" ? "Contrôleur" : "Serveur"} · {x.name}{x.revoked ? " (révoqué)" : ""}</span>)}</div> : <Empty>Aucun contrôleur ni serveur.</Empty>}
          </section>
        </div>
      )}

      {tab === "guests" && canGuests && (
        <div className="grid" style={{ gap: 16 }}>
          {s.perms.has("events.write") && !deleted && <GuestAdd eventId={id} />}
          {guests.length ? (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Nom</th><th>Statut</th><th className="hide-m">WhatsApp</th><th>Table</th><th>Réponse</th></tr></thead>
              <tbody>{guests.map((g) => (
                <tr key={g.id}><td>{g.name}</td><td>{g.kind ? KIND_LABEL[g.kind] : <span className="badge warn">à préciser</span>}</td><td className="hide-m">{g.whatsapp || "—"}</td><td>{g.table_no || "—"}</td>
                  <td>{g.rsvp === "yes" ? <span className="badge ok">Confirmé</span> : g.rsvp === "no" ? <span className="badge bad">Absent</span> : <span className="badge">En attente</span>}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>Aucun invité.</Empty>}
        </div>
      )}

      {tab === "tables" && canGuests && (() => {
        const L = loads(evShape, guests);
        const unplaced = guests.filter((g) => !g.table_no);
        return (
          <div className="grid" style={{ gap: 16 }}>
            {s.perms.has("events.write") && !deleted && (
              <section className="card">
                <h2>Attribution automatique</h2>
                <p className="hint" style={{ marginBottom: 10 }}>{tableCount(evShape, guests)} table(s) de {e.table_capacity} places · {unplaced.length} invitation(s) sans table. Les couples restent ensemble ; la base refuse tout dépassement.</p>
                <ActionForm action={autoAssignAction} hidden={{ event_id: id }} submit="Attribuer automatiquement les places">
                  <label className="row"><input type="checkbox" name="keep" defaultChecked /> Conserver les placements existants</label>
                </ActionForm>
              </section>
            )}
            <div className="grid g3">{L.map((l) => (
              <section key={l.n} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Table {l.n}</h2><span className={"badge " + (l.used > e.table_capacity || l.ghost ? "bad" : l.used === e.table_capacity ? "ok" : "")}>{l.used}/{e.table_capacity}</span></div>
                <Bar value={l.used} max={e.table_capacity} />
                <ul style={{ margin: "10px 0 0", paddingLeft: 18 }} className="hint">{l.guests.map((g) => <li key={g.id}>{g.name}{g.kind === "couple" ? " (2 places)" : ""}</li>)}</ul>
              </section>
            ))}</div>
          </div>
        );
      })()}

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

      {tab === "invitations" && canGuests && <Invitations guests={guests} page={Math.max(1, Number(sp.page) || 1)} id={id} />}
    </>
  );
}

async function Invitations({ guests, page, id }: { guests: { id: string; name: string; invite_token: string; code: string; rsvp: string | null }[]; page: number; id: string }) {
  const size = 24;
  const origin = process.env.ORGANIZER_ORIGIN || "";
  const slice = guests.slice((page - 1) * size, page * size);
  const qrs = await Promise.all(slice.map((g) => QRCode.toDataURL("CRM2:" + g.invite_token, { margin: 1, width: 220, errorCorrectionLevel: "M" })));
  if (!guests.length) return <Empty>Aucun invité.</Empty>;
  return (
    <>
      <p className="hint" style={{ marginBottom: 12 }}>Chaque invitation possède un lien personnel et un QR code unique (commun au couple). Les liens s’ouvrent sur le domaine de la plateforme, jamais sur celui de l’administration.</p>
      <div className="grid g3">{slice.map((g, i) => (
        <section key={g.id} className="card" style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <b>{g.name}</b>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrs[i]} alt={`QR code de ${g.name}`} width={140} height={140} style={{ background: "#fff", borderRadius: 8 }} />
          <span className="hint">Code {g.code}</span>
          <a className="btn ghost sm" href={qrs[i]} download={`qr-${g.code}.png`}>Télécharger le QR</a>
          <input className="in" readOnly value={`${origin}/i/${g.invite_token}`} aria-label={`Lien de ${g.name}`} />
        </section>
      ))}</div>
      <Pager page={page} size={size} total={guests.length} href={(p) => `/events/${id}?tab=invitations&page=${p}`} />
    </>
  );
}
