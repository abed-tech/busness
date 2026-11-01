import Link from "next/link";
import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { paymentMethods } from "@/lib/payments";
import { Notice } from "@/components/ui";
import { StepHeader } from "@/components/EventForm";
import { PayForm } from "@/components/PayForm";
import { money, plur } from "@/lib/format";
import { startPayment } from "./actions";

export const metadata = { title: "Paiement · Skyevenapp" };

type Billing = { free: boolean; persons: number; units: number; unit_cents: number; unit_persons: number; currency: string; paid_cents: number; pending_cents: number; remaining_cents: number };

/**
 * Page de paiement réel : le montant (calculé par la base, event_billing), puis moyen de paiement et,
 * pour le mobile money, réseau et numéro. Le détail du calcul reste replié.
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
  const back = draft ? `/preview/${id}` : `/events/${id}`;

  return (
    <>
      {draft && <StepHeader step={8} />}
      {!b ? <Notice tone="bad">Paiement indisponible pour le moment. Réessayez dans un instant.</Notice> : (
        <section className="card form pay-one" aria-labelledby="pay-amount">
          <p className="eyebrow">{ev.title}</p>
          {b.free || b.remaining_cents <= 0 ? <>
            <h1 id="pay-amount">{b.free ? "Événement offert" : "Tout est réglé"}</h1>
            <Link className="btn pay-main" href={`/events/${id}`}>Accéder à mon événement</Link>
          </> : <>
            <div>
              <span className="lbl">Total à payer</span>
              <p id="pay-amount" className="pay-total">{money(b.remaining_cents, b.currency)}</p>
            </div>
            <details className="hint">
              <summary>Détail</summary>
              {plur(b.persons, "personne")} · {b.units} × {money(b.unit_cents, b.currency)} (tranche de {b.unit_persons}){b.paid_cents > 0 && <> · déjà réglé {money(b.paid_cents, b.currency)}</>}
            </details>
            {!owner ? <p className="hint">Seul l’organisateur qui a créé cet événement peut le régler.</p>
              : !methods.length ? <p className="notice">Paiement en ligne pas encore disponible. Contactez l’équipe Skyevenapp.</p>
              : <>
                {b.pending_cents > 0 && <p className="notice">Un paiement attend déjà sa confirmation.</p>}
                <PayForm action={startPayment} eventId={id} amount={money(b.remaining_cents, b.currency)} methods={methods} askPhone={pm.mobileProvider === "wonyapay"} />
              </>}
          </>}
          <a className="pay-back" href={back}>← Retour</a>
        </section>
      )}
    </>
  );
}
