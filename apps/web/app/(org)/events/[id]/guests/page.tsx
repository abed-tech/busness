import Link from "next/link";
import { readiness, KIND_LABEL } from "@ceremonia/core";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite } from "@/lib/event";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { GuestAdd } from "@/components/GuestAdd";
import { plur } from "@/lib/format";

const FILTERS = [["all", "Toutes"], ["todo", "À compléter"], ["ready", "Prêtes"], ["yes", "Présence confirmée"], ["no", "Déclinées"], ["wait", "Sans réponse"]] as const;

export default async function Guests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; f?: string; saved?: string; deleted?: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  const ev = await loadEvent(id);
  const [guests, catalog] = await Promise.all([loadGuests(id), loadCatalog(id)]);
  const cat = { drinks: catalog.filter((c) => c.kind === "drink").length, dishes: catalog.filter((c) => c.kind === "dish").length };
  const R = new Map(guests.map((g) => [g.id, readiness(ev, guests, g, cat)]));
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "all";
  const q = (sp.q || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const list = guests.filter((g) => {
    if (q && !(g.name + " " + g.whatsapp + " " + g.code).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(q)) return false;
    const r = R.get(g.id)!;
    return f === "all" || (f === "todo" && r.length > 0) || (f === "ready" && !r.length) || (f === "yes" && g.rsvp === "yes") || (f === "no" && g.rsvp === "no") || (f === "wait" && !g.rsvp);
  });
  const persons = guests.reduce((s, g) => s + (g.kind === "couple" ? 2 : 1), 0);
  const write = canWrite(ev, me);
  return (
    <>
      <PageHeader eyebrow="Préparer" title="Invités" sub={`${plur(guests.length, "invitation")} · ${plur(persons, "personne")} · un couple compte pour deux`} />
      {sp.saved && <Notice tone="ok">Invité enregistré.</Notice>}
      {sp.deleted && <Notice tone="ok">Invité supprimé.</Notice>}
      {write && <div style={{ marginBottom: 16 }}><GuestAdd eventId={id} prefix={ev.phone_prefix} /></div>}
      <form className="sticky-tools" role="search">
        <input className="in" name="q" defaultValue={sp.q || ""} placeholder="Rechercher un nom, un numéro ou un code" aria-label="Rechercher" />
        <input type="hidden" name="f" value={f} />
        <button className="btn ghost" type="submit">Rechercher</button>
      </form>
      <nav className="seg" aria-label="Filtres" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {FILTERS.map(([k, l]) => <Link key={k} href={`/events/${id}/guests?f=${k}${sp.q ? "&q=" + encodeURIComponent(sp.q) : ""}`} aria-current={f === k ? "true" : undefined}>{l}</Link>)}
      </nav>
      {!guests.length ? <Empty>Aucun invité. Ajoutez-les un par un, collez une liste ou importez un fichier.</Empty> : !list.length ? <Empty>Aucun invité ne correspond.</Empty> : (
        <div className="list">
          {list.map((g) => {
            const r = R.get(g.id)!;
            return (
              <Link key={g.id} className="li" href={`/events/${id}/guests/${g.id}`}>
                <span>
                  <b>{g.name}</b>
                  <small>{g.kind ? KIND_LABEL[g.kind] : "Statut à préciser"} · {g.table_no ? `Table ${g.table_no}` : "Sans table"} · {g.whatsapp || "sans WhatsApp"} · code {g.code}</small>
                  {r.length > 0 && <small style={{ display: "block", color: "var(--warn)" }}>{r[0]}{r.length > 1 ? ` (+${r.length - 1})` : ""}</small>}
                </span>
                <span>{g.rsvp === "yes" ? <span className="badge ok">Confirmé</span> : g.rsvp === "no" ? <span className="badge bad">Décliné</span> : g.whatsapp_opened_at ? <span className="badge info">Envoyée</span> : r.length ? <span className="badge warn">À compléter</span> : <span className="badge gold">Prête</span>}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
