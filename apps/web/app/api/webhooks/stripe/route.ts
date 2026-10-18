import { verifyStripe, stripeOutcome } from "@/lib/webhooks/verify";
import { applyPaymentEvent, json } from "@/lib/webhooks/apply";

export const dynamic = "force-dynamic";

/**
 * Webhook Stripe (carte bancaire) : https://<ORGANIZER_ORIGIN>/api/webhooks/stripe
 * Authenticité prouvée par la signature Stripe (STRIPE_WEBHOOK_SECRET) ; horodatage limité à 5 minutes.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 512 * 1024) return json({ error: "too_large" }, 413);
  const ok = await verifyStripe(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET || "");
  if (!ok) return json({ error: "signature" }, 400);
  const ev = JSON.parse(raw);
  const out = stripeOutcome(ev);
  if (!out) return json({ ignored: true }); // 2xx : Stripe ne renvoie pas les événements non utilisés
  try {
    const r = await applyPaymentEvent({ provider: "stripe", providerEventId: ev.id, reference: out.reference, status: out.status, providerRef: out.providerRef, amountCents: out.amountCents, payload: ev });
    // Référence inconnue ou montant incohérent : enregistré (preuve + journal), répondu 200 pour éviter des renvois inutiles.
    return json({ received: true, result: r.error || (r.duplicate ? "duplicate" : "applied") });
  } catch (e) {
    console.error("stripe-webhook", (e as Error).message);
    return json({ error: "retry" }, 500); // Stripe renverra la notification
  }
}

export function GET() { return json({ error: "method" }, 405); }
