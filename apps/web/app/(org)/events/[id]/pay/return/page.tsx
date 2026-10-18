import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { money, TX_LABEL } from "@/lib/format";

export default async function PayReturn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string; dev?: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  const sb = await serverClient();
  const { data: tx } = await sb.from("transactions").select("reference, amount_cents, currency, status, method").eq("reference", sp.ref || "").eq("event_id", id).maybeSingle();
  return (
    <>
      <PageHeader eyebrow="Règlement" title={!tx ? "Paiement introuvable" : tx.status === "succeeded" ? "Paiement confirmé" : tx.status === "pending" ? "Paiement en cours de confirmation" : "Paiement non abouti"} />
      {tx && (
        <div className="card form" style={{ maxWidth: 560 }}>
          <dl className="kv"><dt>Référence</dt><dd><code>{tx.reference}</code></dd><dt>Montant</dt><dd>{money(tx.amount_cents, tx.currency)}</dd><dt>État</dt><dd>{TX_LABEL[tx.status]}</dd></dl>
          {tx.status === "pending" && <>
            <p className="hint">La confirmation arrive directement du prestataire de paiement ; cette page se met à jour toute seule.</p>
            {sp.dev && <div className="notice">Mode test local : aucun prestataire n’est appelé. Confirmez ce paiement avec la commande <code>pnpm dev:confirm-payment {tx.reference}</code> (voir le guide de démarrage).</div>}
            <AutoRefresh seconds={4} />
          </>}
          {tx.status === "succeeded" && <p>L’envoi des invitations est activé.</p>}
          <div><Link className="btn" href={`/events/${id}`}>Retour à l’événement</Link></div>
        </div>
      )}
    </>
  );
}
