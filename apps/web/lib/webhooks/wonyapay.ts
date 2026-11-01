import "server-only";
import { rpc, SERVICE } from "@ceremonia/server";
import { wonyapayPayment } from "@/lib/payments";
import { wonyaOutcome, toCents } from "@/lib/webhooks/verify";
import { applyPaymentEvent } from "@/lib/webhooks/apply";

/** Mémorise l'identifiant Wonya d'un paiement en attente (relecture possible sans notification). */
export async function attachWonyaId(reference: string, wonyaId: string): Promise<void> {
  const r = await rpc(SERVICE, "attach_provider_ref", { p_reference: reference, p_provider: "wonyapay", p_provider_ref: wonyaId });
  if (r.error) console.error("wonyapay-attach", r.error.code, r.error.message);
}

/**
 * Relit le paiement auprès de Wonya (source de vérité) puis l'enregistre s'il est définitif.
 * Utilisé par la notification signée et par la page de retour (forfait sans reprises automatiques).
 */
export async function syncWonyaPayment(wonyaId: string, reference: string, payload: unknown): Promise<string> {
  const p = await wonyapayPayment(wonyaId);
  if (!p || p.merchantReference !== reference) return "unknown";
  const out = wonyaOutcome(p);
  if (!out) return "pending";
  const r = await applyPaymentEvent({
    provider: "wonyapay",
    providerEventId: `${p.id}:${out.status}`, // une seule application par paiement et par statut
    reference, status: out.status, providerRef: p.id,
    amountCents: out.amountMinor != null ? toCents(out.amountMinor) : null, payload: { notification: payload, check: p },
  });
  return r.error || (r.duplicate ? "duplicate" : "applied");
}
