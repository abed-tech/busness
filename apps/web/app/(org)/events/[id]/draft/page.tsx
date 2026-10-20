import { redirect } from "next/navigation";
import { KIND_LABEL } from "@ceremonia/core";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
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
  const sb = await serverClient();
  const [guests, catalog, { data: pr }] = await Promise.all([loadGuests(id), loadCatalog(id), sb.rpc("public_pricing")]);
  const unit = pr ? { cents: pr.unit_cents, persons: pr.unit_persons, currency: pr.currency } : undefined;
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
      <EventForm action={updateDraft} eventId={id} initial={{ ...ev }} draft={lists} unit={unit} />
    </>
  );
}
