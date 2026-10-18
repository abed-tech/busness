import type { ReactNode } from "react";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent } from "@/lib/event";
import { EventNav } from "@/components/EventNav";
import { logout } from "../../../(auth)/actions";

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  return (
    <div className="evshell">
      <EventNav id={ev.id} title={ev.title} offer={ev.offer} logout={logout} />
      <div className="evbody">
        {ev.status === "suspended" && <div className="notice bad" style={{ marginBottom: 14 }}>Événement suspendu par l’administration : consultation seule, invitations et accès du jour J bloqués. {ev.status_reason}</div>}
        {children}
      </div>
    </div>
  );
}
