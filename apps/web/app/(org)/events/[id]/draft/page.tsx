import { redirect } from "next/navigation";
import { KIND_LABEL } from "@ceremonia/core";
import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite } from "@/lib/event";
import { PageHeader } from "@/components/ui";
import { EventForm } from "@/components/EventForm";
import { updateDraft } from "../../actions";

/**
 * Retour aux étapes depuis l'aperçu, avant le paiement : les mêmes écrans que la création, déjà remplis
 * avec les informations du brouillon. À la fin, l'organisateur retrouve ses photos puis l'aperçu.
 */
export default async function DraftSteps({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  if (ev.status !== "draft") redirect(`/events/${id}/edit`);
  if (!canWrite(ev, me) || ev.owner_id !== me.id) redirect("/events");
  const [guests, catalog, bill] = await Promise.all([loadGuests(id), loadCatalog(id), rpc<{ flat: boolean; due_cents: number; currency: string }>("event_billing", { p_event: id })]);
  // prix figé à la création de ce brouillon (un brouillon antérieur au prix unique garde son tarif d'origine : pas d'annonce)
  const price = bill.ok && bill.data.flat ? { cents: bill.data.due_cents, currency: bill.data.currency } : undefined;
  const lists = {
    drinks: catalog.filter((c) => c.kind === "drink").map((c) => c.name).join("\n"),
    dishes: catalog.filter((c) => c.kind === "dish").map((c) => c.name).join("\n"),
    guests: guests.map((g) => [g.name, g.kind ? KIND_LABEL[g.kind] : "", g.whatsapp].filter(Boolean).join(" ; ")).join("\n"),
  };
  return (
    <>
      <PageHeader eyebrow="Nouvel événement · non payé" title="Modifier les informations"
        sub="Vos informations sont conservées. Après l’enregistrement, vous retrouverez vos photos puis l’aperçu de l’invitation."
        actions={<a className="btn ghost sm" href={`/preview/${id}`}>Retour à l’aperçu</a>} />
      <EventForm action={updateDraft} eventId={id} initial={{ ...ev }} draft={lists} price={price} />
    </>
  );
}
