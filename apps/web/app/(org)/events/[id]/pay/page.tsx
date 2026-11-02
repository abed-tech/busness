import type { ReactNode } from "react";
import Link from "next/link";
import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { paymentMethods } from "@/lib/payments";
import { PayForm } from "@/components/PayForm";
import { ActionForm } from "@/components/ActionForm";
import { money } from "@/lib/format";
import { startPayment, activateOfferedEvent } from "./actions";

export const metadata = { title: "Paiement · Skyevenapp" };

type Billing = { free: boolean; flat: boolean; currency: string; remaining_cents: number };

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

  // ce que couvre le montant : prix unique, une seule fois pour cet événement
  const note = b?.flat ? "Prix unique pour cet événement, payé une seule fois : invités et invitations illimités, toutes les fonctionnalités incluses." : "Paiement unique pour cet événement.";
  let body: ReactNode;
  if (!b) body = msg("Paiement indisponible pour le moment. Réessayez dans un instant.");
  else if (b.free && ev.status === "draft") body = owner
    ? msg("Événement offert par Skyevenapp : rien à payer.", <ActionForm action={activateOfferedEvent} hidden={{ event_id: id }} submit="Générer mon invitation" />)
    : msg("Seul l’organisateur qui a créé cet événement peut le finaliser.");
  else if (b.free || b.remaining_cents <= 0) body = msg(b.free ? "Événement offert : rien à payer." : "Tout est réglé.", <Link className="btn pay-main" href={`/events/${id}`}>Accéder à mon événement</Link>);
  else if (!owner) body = msg("Seul l’organisateur qui a créé cet événement peut le régler.");
  else if (pm.mobile_money) body = <PayForm action={startPayment} eventId={id} amount={money(b.remaining_cents, b.currency)} note={note} askPhone={pm.mobileProvider === "wonyapay"} backHref={back} />;
  else if (pm.card) body = msg(`Montant : ${money(b.remaining_cents, b.currency)}`, <><p className="hint" style={{ margin: 0, textAlign: "center" }}>{note}</p><ActionForm action={startPayment} hidden={{ event_id: id, method: "card" }} submit="Payer par carte" /></>);
  else body = msg("Le paiement en ligne n’est pas encore disponible. Contactez l’équipe Skyevenapp.");

  return <section className="card pay-one">{body}</section>;
}
