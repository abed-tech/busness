import { notFound } from "next/navigation";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { Invitation } from "@/components/Invitation";
import { BackLink } from "@/components/ui";

/** Aperçu construit à partir des données de l'organisateur (fonctionne aussi avant le règlement). */
export default async function Preview({ params }: { params: Promise<{ id: string; gid: string }> }) {
  await requireOrganizer();
  const { id, gid } = await params;
  const ev = await loadEvent(id);
  const [guests, catalog] = await Promise.all([loadGuests(id), loadCatalog(id)]);
  const g = guests.find((x) => x.id === gid);
  if (!g) notFound();
  const sb = await serverClient();
  const [{ data: order }, { data: entry }] = await Promise.all([
    sb.from("guest_orders").select("drinks, dishes").eq("guest_id", gid).maybeSingle(),
    sb.from("entries").select("confirmed_at").eq("guest_id", gid).maybeSingle(),
  ]);
  return (
    <div style={{ margin: "0 -16px" }}>
      <div style={{ padding: "0 16px 12px" }}><BackLink href={`/events/${id}/guests/${gid}`}>Fiche de {g.name}</BackLink></div>
      <Invitation preview data={{
        event: { type: ev.type, host_a: ev.host_a, host_b: ev.host_b, title: ev.title, date: ev.event_date, time: ev.event_time, venue: ev.venue, address: ev.address, dress: ev.dress, message: ev.message, program: ev.program, offer: ev.offer, short_id: ev.short_id, photos: ev.photos },
        guest: { name: g.name, kind: g.kind, seats: g.kind === "couple" ? 2 : 1, table: g.table_no, rsvp: g.rsvp, code: g.code, qr: "CRM2:" + g.invite_token, entered_at: entry?.confirmed_at || null },
        order: order || null,
        catalog,
      }} />
    </div>
  );
}
