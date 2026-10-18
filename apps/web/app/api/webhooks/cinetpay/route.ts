import { verifyCinetpayToken, cinetpayOutcome, toCents } from "@/lib/webhooks/verify";
import { applyPaymentEvent, json } from "@/lib/webhooks/apply";

export const dynamic = "force-dynamic";

/**
 * Notification CinetPay (mobile money) : https://<ORGANIZER_ORIGIN>/api/webhooks/cinetpay
 * Sécurité : 1) jeton x-token (HMAC, CINETPAY_SECRET_KEY) ; 2) statut et montant relus auprès de CinetPay
 * (/v2/payment/check) : le contenu de la notification n'est jamais cru tel quel.
 */
export async function GET() { return json({ ok: true }); } // CinetPay teste parfois l'URL en GET

export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "invalid" }, 400); }
  const fields: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === "string") fields[k] = v.slice(0, 2000); });
  const siteId = process.env.CINETPAY_SITE_ID || "";
  if (!siteId || fields.cpm_site_id !== siteId || !/^CRM-[A-Z0-9]{10}$/.test(fields.cpm_trans_id || "")) return json({ error: "invalid" }, 400);
  if (!(await verifyCinetpayToken(fields, req.headers.get("x-token"), process.env.CINETPAY_SECRET_KEY || ""))) return json({ error: "token" }, 400);
  try {
    const res = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: process.env.CINETPAY_API_KEY, site_id: siteId, transaction_id: fields.cpm_trans_id }),
      signal: AbortSignal.timeout(15_000),
    });
    const check = await res.json();
    const out = cinetpayOutcome(check);
    if (!out) return json({ pending: true });
    const r = await applyPaymentEvent({
      provider: "cinetpay",
      providerEventId: `${fields.cpm_trans_id}:${out.status}`, // une seule application par transaction et par statut
      reference: fields.cpm_trans_id, status: out.status, providerRef: out.providerRef,
      amountCents: out.amountMinor != null ? toCents(out.amountMinor) : null, payload: { notification: fields, check },
    });
    return json({ received: true, result: r.error || (r.duplicate ? "duplicate" : "applied") });
  } catch (e) {
    console.error("cinetpay-webhook", (e as Error).message);
    return json({ error: "retry" }, 500);
  }
}
