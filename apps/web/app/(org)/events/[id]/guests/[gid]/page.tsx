import Link from "next/link";
import { notFound } from "next/navigation";
import { readiness } from "@ceremonia/core";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, BackLink } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { dateTime } from "@/lib/format";
import { updateGuest, deleteGuest } from "../actions";

export default async function GuestPage({ params }: { params: Promise<{ id: string; gid: string }> }) {
  const me = await requireOrganizer();
  const { id, gid } = await params;
  const ev = await loadEvent(id);
  const [guests, catalog] = await Promise.all([loadGuests(id), loadCatalog(id)]);
  const g = guests.find((x) => x.id === gid);
  if (!g) notFound();
  const sb = await serverClient();
  const [{ data: order }, { data: entry }] = await Promise.all([
    sb.from("guest_orders").select("drinks, dishes").eq("guest_id", gid).maybeSingle(),
    sb.from("entries").select("confirmed_at, staff_name").eq("guest_id", gid).maybeSingle(),
  ]);
  const name = (i: string) => catalog.find((c) => c.id === i)?.name || "(produit retiré)";
  const cat = { drinks: catalog.filter((c) => c.kind === "drink").length, dishes: catalog.filter((c) => c.kind === "dish").length };
  const issues = readiness(ev, guests, g, cat);
  const write = canWrite(ev, me);
  return (
    <>
      <PageHeader eyebrow="Fiche invité" title={g.name} actions={<><BackLink href={`/events/${id}/guests`}>Invités</BackLink><Link className="btn ghost sm" href={`/events/${id}/preview/${g.id}`}>Aperçu de son invitation</Link></>} />
      <div className="grid g2">
        <section className="card form">
          <h2>Informations</h2>
          {write ? (
            <ActionForm action={updateGuest} hidden={{ event_id: id, guest_id: g.id }} submit="Enregistrer">
              <div className="fld"><label htmlFor="n">Nom ou appellation</label><input id="n" name="name" defaultValue={g.name} required maxLength={120} /></div>
              <div className="fld"><label htmlFor="k">Statut</label><select id="k" name="kind" defaultValue={g.kind || ""} required><option value="" disabled>Choisir</option><option value="mr">Monsieur</option><option value="mme">Madame</option><option value="couple">Couple (2 places)</option></select></div>
              <div className="fld"><label htmlFor="w">WhatsApp</label><input id="w" name="whatsapp" type="tel" defaultValue={g.whatsapp} placeholder={`${ev.phone_prefix} 81 234 5678`} /></div>
            </ActionForm>
          ) : <p>{g.name}</p>}
          <p className="hint">La table se choisit dans la rubrique Tables. Code d’entrée : <b>{g.code}</b></p>
          {write && <div><ConfirmAction action={deleteGuest} danger label="Supprimer l’invité" title={`Supprimer ${g.name} ?`} body="Son invitation ne fonctionnera plus et sa réponse sera effacée." confirmLabel="Supprimer" hidden={{ event_id: id, guest_id: g.id }} /></div>}
        </section>
        <section className="card form">
          <h2>Suivi</h2>
          <dl className="kv">
            <dt>Prête à envoyer</dt><dd>{issues.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{issues.map((x) => <li key={x}>{x}</li>)}</ul> : "Oui"}</dd>
            <dt>Envoyée</dt><dd>{g.whatsapp_opened_at ? dateTime(g.whatsapp_opened_at) : "Pas encore"}</dd>
            <dt>Réponse</dt><dd>{g.rsvp === "yes" ? "Présence confirmée" : g.rsvp === "no" ? "Invitation déclinée" : "Pas encore de réponse"}</dd>
            {order && order.drinks.length > 0 && <><dt>Boissons</dt><dd>{order.drinks.map(name).join(" · ")}</dd></>}
            {order && order.dishes.length > 0 && <><dt>Plats</dt><dd>{order.dishes.map(name).join(" · ")}</dd></>}
            <dt>Entrée</dt><dd>{entry ? `Validée ${dateTime(entry.confirmed_at)} par ${entry.staff_name}` : "Pas encore"}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
