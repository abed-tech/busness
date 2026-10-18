import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  await requireAdmin("events.create");
  return (
    <>
      <PageHeader eyebrow="Événements" title="Créer un événement" sub="Création gratuite par l’administration : aucun paiement n’est déclenché et aucun revenu n’est enregistré." />
      <NewEventForm />
    </>
  );
}
