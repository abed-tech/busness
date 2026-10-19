import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { date, TYPE_LABEL, plur } from "@/lib/format";
import { photoUrl } from "@/lib/event";

type Row = { id: string; title: string; type: string; event_date: string; venue: string; status: string; billing: string; owner_id: string | null; organizer_id: string | null; photos: string[]; guests: { count: number }[] };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ pw?: string; deleted?: string }> }) {
  const me = await requireOrganizer();
  const sp = await searchParams;
  const sb = await serverClient();
  const { data, error } = await sb.from("events").select("id, title, type, event_date, venue, status, billing, owner_id, organizer_id, photos, guests(count)").neq("status", "deleted").order("event_date", { ascending: true });
  // la base filtre déjà (RLS) ; on ne garde en plus que les événements de ce compte, même si une permission globale élargissait la lecture
  const rows = ((data || []) as Row[]).filter((r) => r.owner_id === me.id || r.organizer_id === me.id);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.event_date >= today), past = rows.filter((r) => r.event_date < today);
  const Item = ({ e }: { e: Row }) => (
    <Link className="li evrow" href={`/events/${e.id}`}>
      <span className="evthumb" aria-hidden="true">{e.photos?.[0] ? <img src={photoUrl(e.photos[0])} alt="" loading="lazy" /> : <i>{(e.title.trim()[0] || "·").toUpperCase()}</i>}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b>{e.title}</b><small>{TYPE_LABEL[e.type]} · {date(e.event_date)} · {e.venue} · {plur(e.guests[0]?.count || 0, "invitation")}{e.billing === "free_admin" ? " · offert" : ""}</small></span>
      {e.status === "suspended" ? <span className="badge bad">Suspendu</span> : <span className="badge ok">Actif</span>}
      <span aria-hidden="true">›</span>
    </Link>
  );
  return (
    <main className="org-main">
      <PageHeader eyebrow={`Bonjour ${me.username}`} title="Mes événements" actions={me.status === "active" && <Link className="btn" href="/events/new">+ Nouvel événement</Link>} />
      {sp.pw && <Notice tone="ok">Mot de passe modifié.</Notice>}
      {error ? <div className="error-box">Chargement impossible. Réessayez.</div> : !rows.length ? (
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
