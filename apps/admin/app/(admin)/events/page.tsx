import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, Pager, StatusBadge } from "@/components/ui";
import { date, ORIGIN_LABEL, TYPE_LABEL } from "@/lib/format";

type Item = { id: string; short_id: string; title: string; type: string; event_date: string; venue: string; status: string; origin: string; organizer: string | null; invitations: number; persons: number; present: number };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; origin?: string; page?: string }> }) {
  const s = await requireAdmin("events.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const r = await rpc<{ total: number; items: Item[] }>("admin_list_events", { p_search: sp.q || "", p_status: sp.status || null, p_origin: sp.origin || null, p_page: page, p_size: 20 });
  const qs = (o: Record<string, string | number | undefined>) => "/events?" + new URLSearchParams(Object.entries({ q: sp.q, status: sp.status, origin: sp.origin, ...o }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return (
    <>
      <PageHeader eyebrow="Gestion" title="Événements" actions={s.perms.has("events.create") ? <Link className="btn" href="/events/new">+ Créer un événement</Link> : null} />
      <form className="sticky-tools" role="search">
        <input className="in" name="q" defaultValue={sp.q || ""} placeholder="Rechercher un titre, un lieu ou un identifiant" aria-label="Rechercher" />
        <select className="in" name="status" defaultValue={sp.status || ""} aria-label="Statut" style={{ flex: "0 0 160px" }}>
          <option value="">Tous les statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option>
        </select>
        <select className="in" name="origin" defaultValue={sp.origin || ""} aria-label="Origine" style={{ flex: "0 0 220px" }}>
          <option value="">Toutes les origines</option><option value="organizer">Organisateur</option><option value="admin_platform">Plateforme (gratuit)</option><option value="admin_for_organizer">Offert à un organisateur</option>
        </select>
        <button className="btn ghost" type="submit">Filtrer</button>
      </form>
      {!r.ok ? <ErrorBox message={r.message} /> : !r.data.items.length ? <Empty>Aucun événement ne correspond.</Empty> : (
        <>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Événement</th><th className="hide-m">Date</th><th className="hide-m">Organisateur</th><th>Invités</th><th className="hide-m">Présents</th><th>Statut</th></tr></thead>
            <tbody>{r.data.items.map((e) => (
              <tr key={e.id} className="link">
                <td><Link className="row-link" href={`/events/${e.id}`}><b>{e.title}</b><br /><span className="hint">{TYPE_LABEL[e.type]} · {e.venue} · {ORIGIN_LABEL[e.origin]}</span></Link></td>
                <td className="hide-m">{date(e.event_date)}</td>
                <td className="hide-m">{e.organizer || <span className="hint">Plateforme</span>}</td>
                <td>{e.persons}<span className="hint"> pers.</span></td>
                <td className="hide-m">{e.present}</td>
                <td><StatusBadge s={e.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pager page={page} size={20} total={r.data.total} href={(p) => qs({ page: p })} />
        </>
      )}
    </>
  );
}
