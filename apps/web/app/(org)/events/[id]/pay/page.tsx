import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { paymentMethods } from "@/lib/payments";
import { PayForm } from "@/components/PayForm";
import { ActionForm } from "@/components/ActionForm";
import { money } from "@/lib/format";
import { startPayment } from "./actions";

export const metadata = { title: "Paiement · Skyevenapp" };

type Billing = { free: boolean; currency: string; remaining_cents: number };

/**
 * Page de paiement réel : choix du réseau mobile money, puis numéro et montant calculé par la base (event_billing).
 * La confirmation vient uniquement du prestataire (notification signée ou statut relu) : voir pay/return.
 */
export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const ev = await loadEvent(id);
  const bill = await rpc<Billing>("event_billing", { p_event: id });
  const b = bill.ok ? bill.data : null;
  const pm = paymentMethods();
  const owner = ev.owner_id === me.id && canWrite(ev, me);
  const back = ev.status === "draft" ? `/preview/${id}` : `/events/${id}`;
  const msg = (text: string, action?: ReactNode) => (
    <div className="pay-step"><a className="pay-arrow" href={back} aria-label="Retour">←</a><p className="pay-h">{text}</p>{action}</div>
  );

  let body: ReactNode;
  if (!b) body = msg("Paiement indisponible pour le moment. Réessayez dans un instant.");
  else if (b.free || b.remaining_cents <= 0) body = msg(b.free ? "Événement offert : rien à payer." : "Tout est réglé.", <Link className="btn pay-main" href={`/events/${id}`}>Accéder à mon événement</Link>);
  else if (!owner) body = msg("Seul l’organisateur qui a créé cet événement peut le régler.");
  else if (pm.mobile_money) body = <PayForm action={startPayment} eventId={id} amount={money(b.remaining_cents, b.currency)} askPhone={pm.mobileProvider === "wonyapay"} backHref={back} />;
  else if (pm.card) body = msg(`Montant : ${money(b.remaining_cents, b.currency)}`, <ActionForm action={startPayment} hidden={{ event_id: id, method: "card" }} submit="Payer par carte" />);
  else body = msg("Le paiement en ligne n’est pas encore disponible. Contactez l’équipe Skyevenapp.");

  return <section className="card pay-one">{body}</section>;
}
