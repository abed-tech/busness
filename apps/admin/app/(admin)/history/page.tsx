import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, Pager, Stat, SortTh } from "@/components/ui";
import { dateTime, money } from "@/lib/format";

type Row = { title: string; guests: number; amount_cents: number | null; currency: string; deleted_at: string };
type Totals = { count: number; guests: number; amount_cents: number | null; currency: string };
const SORTS = ["recent", "oldest", "title", "guests", "amount"];

/**
 * Historique statistique des événements supprimés (suppression automatique, par l'organisateur ou l'administration).
 * Seuls le nom, le nombre d'invités et le montant généré sont conservés ; aucune donnée personnelle des invités.
 * Les montants sont masqués sans la permission finances (vérifié par la base).
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  await requireAdmin("reports.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = SORTS.includes(sp.sort || "") ? sp.sort! : "recent";
  const r = await rpc<{ total: number; totals: Totals; items: Row[]; finance: boolean }>("admin_event_history", { p_search: (sp.q || "").slice(0, 80), p_sort: sort, p_page: page, p_size: 25 });
  const qs = (o: Record<string, string | number>) => "/history?" + new URLSearchParams(Object.entries({ q: sp.q || "", sort: sort === "recent" ? "" : sort, ...o }).filter(([, v]) => v !== "").map(([k, v]) => [k, String(v)])).toString();
  const by = (k: string) => qs({ sort: k, page: 1 });
  return (
    <>
      <PageHeader eyebrow="Statistiques" title="Événements supprimés"
        sub="Conservé après chaque suppression : le nom de l’événement, le nombre d’invités et le montant généré. Aucune donnée personnelle (invités, coordonnées, photos, invitations)." />
      {!r.ok ? <ErrorBox message={r.message} /> : (
        <>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            <Stat icon="archive" label="Événements supprimés" value={r.data.totals.count} sub={sp.q ? "pour cette recherche" : "depuis le début"} />
            <Stat icon="users" label="Invités cumulés" value={r.data.totals.guests} />
            {r.data.finance
              ? <Stat icon="money" label="Montant généré" value={money(r.data.totals.amount_cents, r.data.totals.currency)} sub="Paiements confirmés, déjà comptés dans les finances" />
              : <div className="card hint">Les montants ne sont pas visibles avec votre rôle.</div>}
          </div>
          <form className="sticky-tools" role="search">
            <input className="in" name="q" defaultValue={sp.q || ""} placeholder="Rechercher un nom d’événement" aria-label="Rechercher" />
            {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
            <button className="btn ghost" type="submit">Rechercher</button>
          </form>
          {!r.data.items.length ? <Empty>Aucun événement supprimé{sp.q ? " ne correspond" : " pour l’instant"}.</Empty> : (
            <>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr>
                  <SortTh label="Événement" k="title" cur={sort} href={by} />
                  <SortTh label="Invités" k="guests" cur={sort} href={by} className="r" />
                  {r.data.finance && <SortTh label="Montant généré" k="amount" cur={sort} href={by} className="r" />}
                  <SortTh label="Supprimé le" k="recent" cur={sort} href={by} className="hide-m" />
                </tr></thead>
                <tbody>{r.data.items.map((h, i) => (
                  <tr key={i}>
                    <td><b>{h.title}</b></td>
                    <td className="r">{h.guests}</td>
                    {r.data.finance && <td className="r">{money(h.amount_cents, h.currency)}</td>}
                    <td className="hide-m">{dateTime(h.deleted_at)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <Pager page={page} size={25} total={r.data.total} href={(p) => qs({ page: p })} />
            </>
          )}
        </>
      )}
    </>
  );
}
