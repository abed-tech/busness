import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, draftResume } from "@/lib/event";
import { EventNav } from "@/components/EventNav";
import { DraftNav } from "@/components/DraftNav";
import { logout } from "../../../(auth)/actions";

/** Pages ouvertes à un brouillon non payé : les étapes de la création et le paiement. */
const DRAFT_PAGES = /^\/(draft|photos|pay\/simulate)(\/|$)/;

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  if (ev.status === "draft") {
    // Aucun événement non payé n'est actif : les fonctions de gestion s'ouvrent après le paiement confirmé.
    const path = (await headers()).get("x-skyevenapp-path") || "";
    if (!DRAFT_PAGES.test(path.slice(`/events/${id}`.length))) redirect(draftResume(ev));
    return (
      <>
        <DraftNav id={ev.id} title={ev.title} logout={logout} />
        <div className="evshell"><div className="evbody">{children}</div></div>
      </>
    );
  }
  return (
    <>
      <EventNav id={ev.id} title={ev.title} offer={ev.offer} logout={logout} />
      <div className="evshell">
        <div className="evbody">
          {ev.status === "suspended" && <div className="notice bad" style={{ marginBottom: 14 }}>Événement suspendu par l’administration : consultation seule, invitations et accès du jour J bloqués. {ev.status_reason}</div>}
          {children}
        </div>
      </div>
    </>
  );
}
