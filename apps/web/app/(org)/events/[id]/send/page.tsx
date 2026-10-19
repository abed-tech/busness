import Link from "next/link";
import { readiness } from "@ceremonia/core";
import { requireOrganizer, rpc, origin } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite } from "@/lib/event";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { SendList } from "@/components/SendList";
import { money, longDate } from "@/lib/format";

export default async function Send({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  const [guests, catalog, bill] = await Promise.all([loadGuests(id), loadCatalog(id), rpc<{ can_send: boolean; remaining_cents: number; paid_cents: number; currency: string }>("event_billing", { p_event: id })]);
  const cat = { drinks: catalog.filter((c) => c.kind === "drink").length, dishes: catalog.filter((c) => c.kind === "dish").length };
  const rows = guests.map((g) => {
    const link = `${origin()}/i/${g.invite_token}`;
    return {
      id: g.id, name: g.name, whatsapp: g.whatsapp, sent: g.whatsapp_opened_at, rsvp: g.rsvp, code: g.code, table: g.table_no, link,
      issues: readiness(ev, guests, g, cat),
      text: `Bonjour ${g.name},\n\nVous êtes invité(e) : ${ev.title}, le ${longDate(ev.event_date)} à ${ev.event_time.slice(0, 5)}, ${ev.venue}.\n\nVotre invitation personnelle (merci de confirmer votre présence) :\n${link}`,
    };
  });
  const canSend = bill.ok && bill.data.can_send;
  const ready = rows.filter((r) => !r.issues.length);
  // même règle que la base (private.invitations_open) : un lien d'invitation ne s'ouvre que si l'événement est actif
  // et offert ou réglé au moins en partie ; avant, le lien partagé afficherait « Invitation indisponible »
  const linksOpen = ev.status === "active" && (ev.billing === "free_admin" || (bill.ok && bill.data.paid_cents > 0));
  return (
    <>
      <PageHeader eyebrow="Préparer" title="Envoi des invitations" sub={`${ready.length} prête(s) sur ${rows.length} · l’envoi ouvre WhatsApp, vous validez chaque message.`} />
      {!canSend && bill.ok && <Notice tone="bad">Règlement en attente : réglez {money(bill.data.remaining_cents, bill.data.currency)} depuis <Link href={`/events/${id}`}>l’accueil de l’événement</Link> pour activer l’envoi.</Notice>}
      {!ev.photos.length && <Notice tone="bad">Aucune photo : ajoutez au moins une photo depuis <Link href={`/events/${id}/edit`}>Modifier l’événement</Link> pour activer l’envoi.</Notice>}
      {!rows.length ? <Empty>Ajoutez d’abord des invités.</Empty> : <SendList eventId={id} rows={rows} enabled={canSend && canWrite(ev, me)} linksOpen={linksOpen} />}
    </>
  );
}
