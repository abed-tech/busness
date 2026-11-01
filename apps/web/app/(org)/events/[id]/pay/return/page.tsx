import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { syncWonyaPayment } from "@/lib/webhooks/wonyapay";
import { PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { money, TX_LABEL } from "@/lib/format";

type Tx = { reference: string; amount_cents: number; currency: string; status: string; method: string; provider: string; provider_ref: string | null; created_at: string };

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
  return (
    <>
      <PageHeader eyebrow="Règlement" title={!tx ? "Paiement introuvable" : tx.status === "succeeded" ? "Paiement confirmé" : tx.status === "pending" ? (wonya ? "Validez le paiement sur votre téléphone" : "Paiement en cours de confirmation") : "Paiement non abouti"} />
      {tx && (
        <div className="card form" style={{ maxWidth: 560 }}>
          <dl className="kv"><dt>Référence</dt><dd><code>{tx.reference}</code></dd><dt>Montant</dt><dd>{money(tx.amount_cents, tx.currency)}</dd><dt>État</dt><dd>{TX_LABEL[tx.status]}</dd></dl>
          {tx.status === "pending" && <>
            {wonya
              ? <p className="hint">Une demande de paiement a été envoyée à votre numéro : confirmez-la avec votre code mobile money. Sans confirmation dans la minute, elle expire et rien n’est débité. Cette page se met à jour toute seule.</p>
              : <p className="hint">La confirmation arrive directement du prestataire de paiement ; cette page se met à jour toute seule.</p>}
            {sp.dev && <div className="notice">Mode test local : aucun prestataire n’est appelé. Confirmez ce paiement avec la commande <code>pnpm dev:confirm-payment {tx.reference}</code> (voir le guide de démarrage).</div>}
            <AutoRefresh seconds={4} />
          </>}
          {tx.status === "failed" && wonya && <p className="hint">Demande refusée ou expirée : rien n’a été débité. Vous pouvez relancer le paiement.</p>}
          {tx.status === "succeeded" && <p>L’envoi des invitations est activé.</p>}
          <div className="row">
            {(tx.status === "failed" || tx.status === "cancelled") && <Link className="btn" href={`/events/${id}/pay`}>Réessayer le paiement</Link>}
            <Link className={tx.status === "failed" || tx.status === "cancelled" ? "btn ghost" : "btn"} href={`/events/${id}`}>Retour à l’événement</Link>
          </div>
        </div>
      )}
    </>
  );
}
