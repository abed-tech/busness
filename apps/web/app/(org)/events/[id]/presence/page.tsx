import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Bar } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { hm, plur } from "@/lib/format";

type Stats = { confirmed_persons: number; presence: { persons: number; invitations: number } };

export default async function Presence({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  await loadEvent(id);
  const sb = await serverClient();
  const [st, { data: entries }] = await Promise.all([
    rpc<Stats>("event_stats", { p_event: id }),
    sb.from("entries").select("confirmed_at, staff_name, persons, guests(name, table_no)").eq("event_id", id).order("confirmed_at", { ascending: false }),
  ]);
  const s = st.ok ? st.data : null;
  type E = { confirmed_at: string; staff_name: string; persons: number; guests: { name: string; table_no: number | null } | null };
  const q = (sp.q || "").toLowerCase();
  const list = ((entries || []) as unknown as E[]).filter((e) => !q || (e.guests?.name || "").toLowerCase().includes(q));
  return (
    <>
      <PageHeader eyebrow="Jour J" title="Suivi de présence" />
      {s && (
        <>
          <div className="big3" style={{ marginBottom: 10 }}>
            <div><b>{s.presence.persons}</b><span>Personnes présentes</span></div>
            <div><b>{s.presence.invitations}</b><span>Invitations validées</span></div>
            <div><b>{Math.max(0, s.confirmed_persons - s.presence.persons)}</b><span>Attendues encore</span></div>
          </div>
          <Bar value={s.presence.persons} max={s.confirmed_persons} />
          <p className="hint" style={{ textAlign: "center", margin: "8px 0 16px" }}>Seules les entrées confirmées par un contrôleur sont comptées.</p>
        </>
      )}
      <AutoRefresh seconds={5} />
      <form className="sticky-tools" role="search"><input className="in" name="q" defaultValue={sp.q || ""} placeholder="Rechercher un invité présent" aria-label="Rechercher" /><button className="btn ghost">Rechercher</button></form>
      {!entries?.length ? <Empty>Aucune entrée confirmée pour l’instant.</Empty> : !list.length ? <Empty>Aucun invité présent ne correspond.</Empty> : (
        <div className="list">
          {list.map((e, i) => (
            <div key={i} className="li">
              <span><b>{e.guests?.name}</b><small>{e.guests?.table_no ? `Table ${e.guests.table_no}` : "Sans table"} · {plur(e.persons, "personne")} · {e.staff_name}</small></span>
              <span className="hint">{hm(e.confirmed_at)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
