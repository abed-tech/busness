import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, Pager, StatusBadge } from "@/components/ui";
import { date, money } from "@/lib/format";

type Item = { id: string; username: string; full_name: string | null; email: string | null; phone: string | null; status: string; created_at: string; events: number; paid_cents: number | null };

export default async function OrganizersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const s = await requireAdmin("organizers.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const r = await rpc<{ total: number; items: Item[] }>("admin_list_organizers", { p_search: (sp.q || "").slice(0, 80), p_status: sp.status || null, p_page: page, p_size: 20 });
  const fin = s.perms.has("finance.read");
  const qs = (p: number) => "/organizers?" + new URLSearchParams(Object.entries({ q: sp.q || "", status: sp.status || "", page: String(p) }).filter(([, v]) => v)).toString();
  return (
    <>
      <PageHeader eyebrow="Comptes" title="Organisateurs" sub="Coordonnées et activité des comptes. Les choix privés des invités ne sont jamais affichés ici." />
      <form className="sticky-tools" role="search">
        <input className="in" name="q" defaultValue={sp.q || ""} placeholder="Nom d’utilisateur, e-mail ou téléphone" aria-label="Rechercher" />
        <select className="in" name="status" defaultValue={sp.status || ""} aria-label="Statut" style={{ flex: "0 0 170px" }}>
          <option value="">Tous les statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option>
        </select>
        <button className="btn ghost" type="submit">Filtrer</button>
      </form>
      {!r.ok ? <ErrorBox message={r.message} /> : !r.data.items.length ? <Empty>Aucun organisateur ne correspond.</Empty> : (
        <>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Organisateur</th><th className="hide-m">Contact</th><th className="hide-m">Inscription</th><th>Événements</th>{fin && <th className="r hide-m">Payé</th>}<th>Statut</th></tr></thead>
            <tbody>{r.data.items.map((o) => (
              <tr key={o.id} className="link">
                <td><Link className="row-link" href={`/organizers/${o.id}`}><b>{o.username}</b>{o.full_name && <><br /><span className="hint">{o.full_name}</span></>}</Link></td>
                <td className="hide-m">{o.email || "—"}<br /><span className="hint">{o.phone || ""}</span></td>
                <td className="hide-m">{date(o.created_at)}</td>
                <td>{o.events}</td>
                {fin && <td className="r hide-m">{money(o.paid_cents)}</td>}
                <td><StatusBadge s={o.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pager page={page} size={20} total={r.data.total} href={qs} />
        </>
      )}
    </>
  );
}
