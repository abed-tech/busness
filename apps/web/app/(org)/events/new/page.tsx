import { redirect } from "next/navigation";
import { requireOrganizer } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { PageHeader, BackLink } from "@/components/ui";
import { EventForm } from "@/components/EventForm";
import { createEvent } from "../actions";

export default async function NewEvent() {
  const me = await requireOrganizer();
  if (me.status !== "active") redirect("/events");
  const sb = await serverClient();
  const { data: pr } = await sb.rpc("public_pricing");
  const unit = pr ? { cents: pr.unit_cents, persons: pr.unit_persons, currency: pr.currency } : undefined;
  return (
    <main className="org-main">
      <PageHeader eyebrow="Nouvel événement" title="Créer un événement" actions={<BackLink href="/events">Mes événements</BackLink>} />
      <EventForm action={createEvent} unit={unit} />
    </main>
  );
}
