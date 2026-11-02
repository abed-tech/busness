import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  await requireAdmin("events.create");
  return (
    <>
      <PageHeader eyebrow="Événements" title="Offrir un événement" sub="Création gratuite pour le compte d’un organisateur : aucun paiement n’est déclenché, aucun revenu n’est enregistré, et seul l’organisateur gère ensuite l’événement." />
      <NewEventForm />
    </>
  );
}
