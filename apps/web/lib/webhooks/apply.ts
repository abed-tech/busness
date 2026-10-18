import "server-only";
import { rpc, SERVICE } from "@ceremonia/server";

/** Enregistre une notification vérifiée dans la base (rôle serveur, fonction apply_payment_event : idempotente, montant revérifié). */
export async function applyPaymentEvent(args: {
  provider: "stripe" | "cinetpay"; providerEventId: string; reference: string;
  status: "succeeded" | "failed" | "refunded"; providerRef: string | null; amountCents: number | null; payload: unknown;
}): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const r = await rpc<{ ok: boolean; error?: string; duplicate?: boolean }>(SERVICE, "apply_payment_event", {
    p_provider: args.provider, p_provider_event_id: args.providerEventId, p_reference: args.reference, p_status: args.status,
    p_provider_ref: args.providerRef, p_amount_cents: args.amountCents, p_payload: args.payload,
  });
  if (r.error) throw new Error(`Base de données : ${r.error.code} ${r.error.message}`);
  return r.data;
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
