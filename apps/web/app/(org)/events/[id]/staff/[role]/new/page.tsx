import { notFound } from "next/navigation";
import { requireOrganizer, origin } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { PageHeader, Notice } from "@/components/ui";
import { AddModes, isAddMode } from "@/components/SearchAdd";
import { StaffCreate, StaffListAdd } from "@/components/StaffCreate";
import { ROLE, isRole } from "@/lib/staff";

export default async function NewStaff({ params, searchParams }: { params: Promise<{ id: string; role: string }>; searchParams: Promise<{ mode?: string }> }) {
  const me = await requireOrganizer();
  const { id, role } = await params;
  if (!isRole(role)) notFound();
  const { mode } = await searchParams;
  const ev = await loadEvent(id);
  const R = ROLE[role];
  const m = isAddMode(mode) ? mode : null;
  const common = { eventId: id, role, label: R.one, linkBase: `${origin()}/k/${ev.short_id}/`, eventTitle: ev.title };
  return (
    <>
      <PageHeader eyebrow={R.many} title={`Ajouter des ${R.many.toLowerCase()}`} sub="Chaque personne reçoit un lien, un code d’accès et un mot de passe." />
      {!canWrite(ev, me) ? <Notice>Cet événement ne peut plus être modifié.</Notice> : (
        <div className="grid" style={{ gap: 16 }}>
          <AddModes base={`/events/${id}/staff/${role}/new`} current={m} text={{
            one: "Nom et mot de passe initial d’une personne.",
            file: "Fichier Excel (.xlsx) ou CSV : Nom ; Mot de passe.",
            paste: "Une personne par ligne : Nom ; Mot de passe.",
          }} />
          {m === "one" && <StaffCreate {...common} placeholder={R.ph} />}
          {(m === "file" || m === "paste") && <StaffListAdd key={m} {...common} mode={m} />}
        </div>
      )}
    </>
  );
}
