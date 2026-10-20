import { redirect } from "next/navigation";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, canWrite, photoUrl } from "@/lib/event";
import { PageHeader, BackLink } from "@/components/ui";
import { EventForm } from "@/components/EventForm";
import { PhotoManager } from "@/components/PhotoManager";
import { updateEvent } from "../../actions";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  if (ev.status === "draft") redirect(`/events/${id}/draft`); // brouillon non payé : mêmes écrans que la création
  if (!canWrite(ev, me)) redirect(`/events/${id}`);
  return (
    <>
      <PageHeader eyebrow="Modifier" title={ev.title} actions={<BackLink href={`/events/${id}`}>Accueil de l’événement</BackLink>} />
      <section className="card form" style={{ maxWidth: 860, marginBottom: 16 }}>
        <h2>Photos de l’invitation</h2>
        <p className="hint">De une à quatre photos. Au moins une photo est obligatoire pour envoyer les invitations : elles défilent en arrière-plan.</p>
        <PhotoManager eventId={id} photos={ev.photos.map((p) => ({ path: p, url: photoUrl(p) }))} />
      </section>
      <EventForm action={updateEvent} eventId={id} initial={{ ...ev }} />
    </>
  );
}
