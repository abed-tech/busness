import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, canWrite, photoUrl } from "@/lib/event";
import { PageHeader, Notice } from "@/components/ui";
import { PhotoManager } from "@/components/PhotoManager";
import { StepHeader } from "@/components/EventForm";

/** Dernier écran de la création : au moins une photo avant de terminer. */
export default async function EventPhotos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  const ev = await loadEvent(id);
  if (!canWrite(ev, me)) redirect(`/events/${id}`);
  const n = ev.photos.length;
  return (
    <>
      {sp.new && <StepHeader step={7} />}
      <PageHeader eyebrow={sp.new ? "Nouvel événement" : "Invitation"} title="Vos photos" sub="De une à quatre photos. Au moins une est obligatoire : elle sert de fond à l’invitation." />
      {sp.new && <Notice tone="ok">Événement enregistré. Dernière étape : ajoutez vos photos.</Notice>}
      <section className="card form" style={{ maxWidth: 860, marginBottom: 16 }}>
        <PhotoManager eventId={id} photos={ev.photos.map((p) => ({ path: p, url: photoUrl(p) }))} />
      </section>
      <div className="row" style={{ maxWidth: 860, justifyContent: "flex-end" }}>
        {n > 0
          ? <Link className="btn" href={`/events/${id}${sp.new ? "?created=1" : ""}`}>{sp.new ? "Terminer" : "Retour à l’accueil de l’événement"}</Link>
          : <><span className="hint">Ajoutez au moins une photo pour terminer.</span><span className="btn" aria-disabled="true" style={{ opacity: .45, pointerEvents: "none" }}>{sp.new ? "Terminer" : "Retour"}</span></>}
      </div>
    </>
  );
}
