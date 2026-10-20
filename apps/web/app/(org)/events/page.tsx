import Link from "next/link";
import { requireOrganizer, humanError } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { date, TYPE_LABEL, plur } from "@/lib/format";
import { photoUrl, draftResume } from "@/lib/event";
import { ConfirmAction } from "@/components/ConfirmAction";
import { deleteEvent } from "./actions";

type Row = { id: string; title: string; type: string; event_date: string; venue: string; status: string; billing: string; owner_id: string | null; organizer_id: string | null; photos: string[] };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ pw?: string; deleted?: string }> }) {
  const me = await requireOrganizer();
  const sp = await searchParams;
  const sb = await serverClient();
  // Colonnes simples uniquement : la couche de données (packages/server/src/data.ts) ne traduit pas les relations
  // imbriquées du type « guests(count) » et refusait toute la requête. Les invitations sont comptées à part.
  const { data, error } = await sb.from("events").select("id, title, type, event_date, venue, status, billing, owner_id, organizer_id, photos").neq("status", "deleted").order("event_date", { ascending: true });
  if (error) console.error("Mes événements : chargement impossible", error);
  // la base filtre déjà (RLS) ; on ne garde en plus que les événements de ce compte, même si une permission globale élargissait la lecture
  const mine = ((data || []) as Row[]).filter((r) => r.owner_id === me.id || r.organizer_id === me.id);
  // un brouillon (création non payée) n'est pas un événement : il est listé à part, pour reprendre la création
  const rows = mine.filter((r) => r.status !== "draft"), drafts = mine.filter((r) => r.status === "draft" && r.owner_id === me.id);
  const counts = new Map<string, number>();
  let countError = false;
  if (rows.length) {
    const { data: g, error: e2 } = await sb.from("guests").select("event_id").in("event_id", rows.map((r) => r.id));
    if (e2) { countError = true; console.error("Mes événements : comptage des invitations impossible", e2); }
    for (const x of (g || []) as { event_id: string }[]) counts.set(x.event_id, (counts.get(x.event_id) || 0) + 1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.event_date >= today), past = rows.filter((r) => r.event_date < today);
  // suppression : propriétaire seulement, événement et compte actifs (la base revérifie dans delete_my_event)
  const canDelete = (e: Row) => e.owner_id === me.id && (e.status === "active" || e.status === "draft") && me.status === "active";
  const Draft = ({ e }: { e: Row }) => (
    <div className="li evrow draft">
      <Link className="evlink" href={draftResume(e)}>
        <span className="evthumb" aria-hidden="true">{e.photos?.[0] ? <img src={photoUrl(e.photos[0])} alt="" loading="lazy" /> : <i>{(e.title.trim()[0] || "·").toUpperCase()}</i>}</span>
        <span style={{ flex: 1, minWidth: 0 }}><b>{e.title}</b><small>{TYPE_LABEL[e.type]} · {date(e.event_date)} · {e.photos?.length ? "aperçu prêt, paiement à finaliser" : "photos à ajouter"}</small></span>
        <span className="badge warn">Non payé</span>
        <span aria-hidden="true">›</span>
      </Link>
      {canDelete(e) && (
        <ConfirmAction action={deleteEvent} danger label="Abandonner" title={`Abandonner « ${e.title} » ?`}
          body="Ce brouillon n’a pas été payé : il n’est pas encore un événement. Ses informations, ses invités et ses photos seront effacés. Aucun paiement n’a été effectué."
          needText={e.title} confirmLabel="Abandonner le brouillon" hidden={{ event_id: e.id }} />
      )}
    </div>
  );
  const Item = ({ e }: { e: Row }) => (
    <div className="li evrow">
      <Link className="evlink" href={`/events/${e.id}`}>
        <span className="evthumb" aria-hidden="true">{e.photos?.[0] ? <img src={photoUrl(e.photos[0])} alt="" loading="lazy" /> : <i>{(e.title.trim()[0] || "·").toUpperCase()}</i>}</span>
        <span style={{ flex: 1, minWidth: 0 }}><b>{e.title}</b><small>{TYPE_LABEL[e.type]} · {date(e.event_date)} · {e.venue} · {countError ? "invitations non comptées" : plur(counts.get(e.id) || 0, "invitation")}{e.billing === "free_admin" ? " · offert" : ""}</small></span>
        {e.status === "suspended" ? <span className="badge bad">Suspendu</span> : <span className="badge ok">Actif</span>}
        <span aria-hidden="true">›</span>
      </Link>
      {canDelete(e) && (
        <ConfirmAction action={deleteEvent} danger label="Supprimer" title={`Supprimer « ${e.title} » ?`}
          body={`Cette action est définitive. Les invités, leurs réponses et leurs choix, les tables, le personnel et les photos de cet événement seront effacés, et les liens d’invitation déjà envoyés cesseront de fonctionner. ${counts.get(e.id) ? `Cet événement compte ${plur(counts.get(e.id)!, "invitation")}. ` : ""}Les paiements déjà effectués restent enregistrés mais ne sont pas remboursés.`}
          needText={e.title} confirmLabel="Supprimer définitivement" hidden={{ event_id: e.id }} />
      )}
    </div>
  );
  return (
    <main className="org-main">
      <PageHeader eyebrow={`Bonjour ${me.username}`} title="Mes événements" actions={me.status === "active" && <Link className="btn" href="/events/new">+ Nouvel événement</Link>} />
      {sp.pw && <Notice tone="ok">Mot de passe modifié.</Notice>}
      {sp.deleted && <Notice tone="ok">Événement supprimé.</Notice>}
      {countError && <Notice tone="bad">Le nombre d’invitations n’a pas pu être chargé. Les événements ci-dessous sont à jour.</Notice>}
      {!error && !!drafts.length && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: 4 }}>Créations à finaliser</h2>
          <p className="hint" style={{ marginBottom: 10 }}>Pas encore payées : elles ne sont pas des événements actifs. Reprenez là où vous vous êtes arrêté, vos informations sont conservées.</p>
          <div className="list">{drafts.map((e) => <Draft key={e.id} e={e} />)}</div>
        </section>
      )}
      {error ? (
        <div className="error-box" role="alert">
          <b>Vos événements n’ont pas pu être chargés.</b> {humanError(error.message, error.code)}
          <div style={{ marginTop: 12 }}><a className="btn ghost sm" href="/events">Réessayer</a></div>
        </div>
      ) : !rows.length ? (
        <Empty>Aucun événement pour l’instant. {me.status === "active" && <><br /><br /><Link className="btn" href="/events/new">Créer mon premier événement</Link></>}</Empty>
      ) : (
        <div className="grid" style={{ gap: 22 }}>
          {!!upcoming.length && <section><h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>À venir</h2><div className="list">{upcoming.map((e) => <Item key={e.id} e={e} />)}</div></section>}
          {!!past.length && <section><h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Passés</h2><div className="list">{past.map((e) => <Item key={e.id} e={e} />)}</div></section>}
        </div>
      )}
    </main>
  );
}
