import Link from "next/link";
import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { paymentMethods } from "@/lib/payments";
import { PageHeader, Notice } from "@/components/ui";
import { StepHeader } from "@/components/EventForm";
import { PayForm } from "@/components/PayForm";
import { money, date, plur } from "@/lib/format";
import { startPayment } from "./actions";

export const metadata = { title: "Paiement · Skyevenapp" };

type Billing = { free: boolean; persons: number; units: number; unit_cents: number; unit_persons: number; currency: string; due_cents: number; paid_cents: number; pending_cents: number; remaining_cents: number };

/**
 * Page de paiement réel : récapitulatif calculé par la base (event_billing), puis moyen de paiement et,
 * pour le mobile money, réseau et numéro. Ouverte depuis l'aperçu d'un brouillon et depuis le règlement d'un événement.
 */
export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  const bill = await rpc<Billing>("event_billing", { p_event: id });
  const b = bill.ok ? bill.data : null;
  const pm = paymentMethods();
  const methods = [...(pm.mobile_money ? ["mobile_money" as const] : []), ...(pm.card ? ["card" as const] : [])];
  const draft = ev.status === "draft";
  const owner = ev.owner_id === me.id && canWrite(ev, me);
  const back = draft
    ? <a className="btn ghost" href={`/preview/${id}`}>Retour à l’aperçu</a>
    : <Link className="btn ghost" href={`/events/${id}`}>Retour à l’événement</Link>;

  return (
    <>
      {draft && <StepHeader step={8} />}
      <PageHeader eyebrow={draft ? "Générer mon invitation" : "Règlement"} title="Paiement" />
      {!b ? <Notice tone="bad">Le récapitulatif est indisponible pour le moment. Réessayez dans un instant.</Notice> : (
        <div className="pay-grid">
          <section className="card form pay-card" aria-labelledby="recap">
            <h2 id="recap">Récapitulatif</h2>
            <dl className="kv">
              <dt>Événement</dt><dd><b>{ev.title}</b><br /><span className="hint">{date(ev.event_date)} · {ev.venue}</span></dd>
              <dt>Personnes facturées</dt><dd>{plur(b.persons, "personne")} <span className="hint">(le plus grand entre invités et personnes attendues)</span></dd>
              <dt>Tarif</dt><dd>{money(b.unit_cents, b.currency)} par tranche de {b.unit_persons} personnes</dd>
              <dt>Tranches</dt><dd>{b.units} × {money(b.unit_cents, b.currency)}</dd>
              {b.paid_cents > 0 && <><dt>Déjà réglé</dt><dd>{money(b.paid_cents, b.currency)}</dd></>}
              <dt>Total à payer</dt><dd className="pay-total">{money(b.remaining_cents, b.currency)}</dd>
            </dl>
            <p className="hint">Un couple compte pour deux personnes. {draft ? "Votre événement est créé et ses invitations activées dès la confirmation du paiement." : "Le règlement active l’envoi des invitations."}</p>
          </section>

          <section className="card form pay-card" aria-labelledby="pay">
            <h2 id="pay">Payer</h2>
            {b.free || b.remaining_cents <= 0 ? <>
              <div className="notice ok" role="status">{b.free ? "Événement offert par Skyevenapp : aucun règlement n’est demandé." : "Tout est réglé : rien à payer."}</div>
              <div className="row"><Link className="btn" href={`/events/${id}`}>Accéder à mon événement</Link></div>
            </> : !owner ? <p className="hint">Seul l’organisateur qui a créé cet événement peut le régler.</p>
              : !methods.length ? <p className="notice">Le paiement en ligne n’est pas encore disponible. Contactez l’équipe Skyevenapp.</p>
              : <>
                {b.pending_cents > 0 && <p className="hint">Un paiement de {money(b.pending_cents, b.currency)} attend déjà la confirmation du prestataire. Si vous l’avez validé, patientez avant de payer à nouveau.</p>}
                <PayForm action={startPayment} eventId={id} amount={money(b.remaining_cents, b.currency)} methods={methods} askPhone={pm.mobileProvider === "wonyapay"} />
              </>}
            <div className="row">{back}</div>
          </section>
        </div>
      )}
    </>
  );
}
