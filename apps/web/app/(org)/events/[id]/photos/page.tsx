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
  const draft = ev.status === "draft"; // création en cours : l'étape suivante est l'aperçu, puis le paiement
  const step = sp.new || draft;
  return (
    <>
      {step && <StepHeader step={7} />}
      <PageHeader eyebrow={step ? "Nouvel événement" : "Invitation"} title="Vos photos" sub="De une à quatre photos. Au moins une est obligatoire : elle sert de fond à l’invitation." />
      {step && <Notice tone="ok">Informations enregistrées. Ajoutez vos photos, puis découvrez l’aperçu de votre invitation.</Notice>}
      <section className="card form" style={{ maxWidth: 860, marginBottom: 16 }}>
        <PhotoManager eventId={id} photos={ev.photos.map((p) => ({ path: p, url: photoUrl(p) }))} />
      </section>
      <div className="row" style={{ maxWidth: 860, justifyContent: draft ? "space-between" : "flex-end" }}>
        {draft && <Link className="btn ghost" href={`/events/${id}/draft`}>Précédent</Link>}
        {n > 0
          ? draft
            ? <a className="btn" href={`/preview/${id}`}>Voir l’aperçu de l’invitation</a>
            : <Link className="btn" href={`/events/${id}${sp.new ? "?created=1" : ""}`}>{sp.new ? "Terminer" : "Retour à l’accueil de l’événement"}</Link>
          : <><span className="hint">Ajoutez au moins une photo pour continuer.</span><span className="btn" aria-disabled="true" style={{ opacity: .45, pointerEvents: "none" }}>{draft ? "Voir l’aperçu" : sp.new ? "Terminer" : "Retour"}</span></>}
      </div>
    </>
  );
}
