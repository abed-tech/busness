import { verifyWonya } from "@/lib/webhooks/verify";
import { json } from "@/lib/webhooks/apply";
import { syncWonyaPayment } from "@/lib/webhooks/wonyapay";

export const dynamic = "force-dynamic";

/**
 * Callback Wonya Pay (mobile money RDC) : https://<ORGANIZER_ORIGIN>/api/webhooks/wonyapay
 * Sécurité : 1) signature X-Wonya-Signature (HMAC, WONYAPAY_WEBHOOK_SECRET), horodatage limité à 5 minutes ;
 * 2) statut et montant relus auprès de Wonya (GET /v1/payments/{id}) : le corps n'est jamais cru tel quel.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) return json({ error: "too_large" }, 413);
  const ok = await verifyWonya(raw, req.headers.get("x-wonya-timestamp"), req.headers.get("x-wonya-signature"), process.env.WONYAPAY_WEBHOOK_SECRET || "");
  if (!ok) return json({ error: "signature" }, 400);
  let ev: { event?: string; data?: { id?: unknown; reference?: unknown } };
  try { ev = JSON.parse(raw); } catch { return json({ error: "invalid" }, 400); }
  if (ev.event === "webhook.test") return json({ received: true });
  const id = String(ev.data?.id ?? ""), reference = String(ev.data?.reference ?? "");
  // 2xx : notification d'un paiement qui n'est pas une transaction Skyevenapp (test, décaissement…)
  if (!/^\d{12}$/.test(id) || !/^CRM-[A-Z0-9]{10}$/.test(reference)) return json({ ignored: true });
  try {
    const result = await syncWonyaPayment(id, reference, ev);
    return json({ received: true, result });
  } catch (e) {
    console.error("wonyapay-webhook", (e as Error).message);
    return json({ error: "retry" }, 500);
  }
}

export function GET() { return json({ error: "method" }, 405); }
