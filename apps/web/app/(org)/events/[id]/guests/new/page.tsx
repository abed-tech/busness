import { requireOrganizer } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { PageHeader, Notice } from "@/components/ui";
import { AddModes, isAddMode } from "@/components/SearchAdd";
import { GuestAdd } from "@/components/GuestAdd";

export default async function NewGuests({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const { mode } = await searchParams;
  const ev = await loadEvent(id);
  const m = isAddMode(mode) ? mode : null;
  return (
    <>
      <PageHeader eyebrow="Invités" title="Ajouter des invités" sub="Choisissez comment ajouter vos invitations." />
      {!canWrite(ev, me) ? <Notice>Cet événement ne peut plus être modifié.</Notice> : (
        <div className="grid" style={{ gap: 16 }}>
          <AddModes base={`/events/${id}/guests/new`} current={m} text={{
            one: "Nom, statut et WhatsApp d’une invitation.",
            file: "Fichier Excel (.xlsx) ou CSV.",
            paste: "Une invitation par ligne : Nom ; Statut ; WhatsApp.",
          }} />
          {m && <GuestAdd key={m} eventId={id} prefix={ev.phone_prefix} mode={m} />}
        </div>
      )}
    </>
  );
}
