import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite } from "@/lib/event";
import { Invitation } from "@/components/Invitation";
import { GenerateBar } from "@/components/SimulatedPayment";
import { startSimulatedPayment } from "../../(org)/events/[id]/pay/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aperçu de l’invitation · Skyevenapp", robots: { index: false, follow: false } };
// mêmes réglages d'affichage que la page de l'invité (/i/[token])
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#F5EFE5", viewportFit: "cover" };

/**
 * Étape « Aperçu » de la création : l'invitation telle que l'invité la recevra (même composant que /i/[token],
 * mêmes données : textes, photos, programme, boissons et plats), sans aucun élément de l'espace organisateur.
 * Elle est personnalisée avec le premier invité saisi ; sans invité, avec un nom d'exemple.
 * Pour un brouillon non payé, la barre fixe « Générer mon invitation » ouvre le paiement.
 */
export default async function EventPreview({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  const [guests, catalog] = await Promise.all([loadGuests(id), loadCatalog(id)]);
  const g = guests[0];
  const draft = ev.status === "draft" && canWrite(ev, me) && ev.owner_id === me.id;
  const invitation = (
    <Invitation preview data={{
      event: { type: ev.type, host_a: ev.host_a, host_b: ev.host_b, title: ev.title, date: ev.event_date, time: ev.event_time, venue: ev.venue, address: ev.address, dress: ev.dress, message: ev.message, program: ev.program, offer: ev.offer, short_id: ev.short_id, photos: ev.photos },
      guest: g
        ? { name: g.name, kind: g.kind, seats: g.kind === "couple" ? 2 : 1, table: g.table_no, rsvp: g.rsvp, code: g.code, qr: "CRM2:" + g.invite_token, entered_at: null }
        : { name: "Votre invité", kind: null, seats: 1, table: null, rsvp: null, code: "APERCU", qr: "CRM2:apercu", entered_at: null },
      order: null,
      catalog,
    }} />
  );
  if (!draft) return invitation;
  return (
    <div className="pv">
      {invitation}
      <GenerateBar action={startSimulatedPayment} eventId={id} editHref={`/events/${id}/draft`} />
    </div>
  );
}
