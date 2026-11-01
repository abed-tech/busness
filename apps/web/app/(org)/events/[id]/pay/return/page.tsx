import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { syncWonyaPayment } from "@/lib/webhooks/wonyapay";
import { AutoRefresh, AutoRedirect } from "@/components/AutoRefresh";
import { money } from "@/lib/format";

type Tx = { reference: string; amount_cents: number; currency: string; status: string; method: string; provider: string; provider_ref: string | null; created_at: string };

/**
 * Suivi d'un paiement réel : attente de la confirmation sur le téléphone, puis succès (suite automatique) ou échec (réessayer).
 * Le statut vient uniquement du prestataire (notification signée ou statut relu auprès de Wonya), jamais du navigateur.
 */
export default async function PayReturn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string; dev?: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  const sb = await serverClient();
  const load = () => sb.from("transactions").select("reference, amount_cents, currency, status, method, provider, provider_ref, created_at").eq("reference", sp.ref || "").eq("event_id", id).maybeSingle();
  let { data: tx } = await load() as { data: Tx | null };
  // Wonya Pay : si la notification tarde (forfait sans reprises), le statut est relu auprès de Wonya, jamais pris du navigateur
  const wonya = tx?.provider === "wonyapay";
  if (tx && wonya && tx.status === "pending" && tx.provider_ref && Date.now() - Date.parse(tx.created_at) > 15_000) {
    try {
      if ((await syncWonyaPayment(tx.provider_ref, tx.reference, { source: "return_page" })) === "applied") tx = (await load() as { data: Tx | null }).data;
    } catch (e) {
      console.error("wonyapay-return", (e as Error).message);
    }
  }
  const retry = <Link className="btn pay-main" href={`/events/${id}/pay`}>Réessayer</Link>;

  if (!tx) {
    return <section className="card pay-one"><div className="pay-step"><p className="pay-h">Paiement introuvable</p>{retry}</div></section>;
  }
  const amount = money(tx.amount_cents, tx.currency);

  if (tx.status === "succeeded") {
    // premier paiement confirmé : c'est lui qui vient de créer l'événement (transactions_activate_draft)
    const { data: paid } = await sb.from("transactions").select("reference").eq("event_id", id).eq("status", "succeeded").limit(2);
    const next = `/events/${id}${(paid as unknown[] | null)?.length === 1 ? "?created=1" : ""}`;
    return (
      <section className="card pay-one">
        <div className="pay-step pay-state" role="status">
          <span className="pay-icon ok" aria-hidden="true">✓</span>
          <p className="pay-h">Paiement confirmé</p>
          <p className="hint">{amount} reçus. Nous finalisons votre événement…</p>
          <Link className="btn pay-main" href={next}>Continuer</Link>
          <AutoRedirect to={next} />
        </div>
      </section>
    );
  }

  if (tx.status === "pending") {
    const late = Date.now() - Date.parse(tx.created_at) > 3 * 60_000; // la demande Wonya a expiré depuis longtemps
    return (
      <section className="card pay-one">
        <div className="pay-step pay-state" aria-live="polite">
          <span className="spin pay-spin" aria-hidden="true" />
          <p className="pay-h">{wonya ? "Confirmez sur votre téléphone" : "Confirmation en cours…"}</p>
          <p className="hint">{wonya ? <>Saisissez votre code PIN pour valider le débit de <b>{amount}</b>.</> : "La confirmation arrive directement du prestataire de paiement."}</p>
          {sp.dev && <div className="notice">Mode test local : confirmez avec <code>pnpm dev:confirm-payment {tx.reference}</code>.</div>}
          {late && <>
            <p className="hint">Aucune confirmation reçue. Si vous n’avez rien validé, rien n’a été débité.</p>
            {retry}
          </>}
          <AutoRefresh seconds={4} quiet />
        </div>
      </section>
    );
  }

  return (
    <section className="card pay-one">
      <div className="pay-step pay-state" role="alert">
        <span className="pay-icon bad" aria-hidden="true">✕</span>
        <p className="pay-h">Paiement non abouti</p>
        <p className="hint">{tx.status === "cancelled" ? "Paiement annulé." : "Demande refusée ou expirée."} Rien n’a été débité.</p>
        {retry}
      </div>
    </section>
  );
}
