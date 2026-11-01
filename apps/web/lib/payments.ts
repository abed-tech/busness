import "server-only";

/** Moyens de paiement réellement configurés (clés présentes côté serveur). */
export function paymentMethods() {
  const devLocal = process.env.NODE_ENV !== "production" && process.env.DEV_PAYMENTS === "1";
  const wonya = !!process.env.WONYAPAY_TOKEN;
  return {
    card: !!process.env.STRIPE_SECRET_KEY || devLocal,
    mobile_money: wonya || !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID) || devLocal,
    // Wonya Pay (RDC) prioritaire quand il est configuré ; il demande le numéro du payeur
    mobileProvider: (wonya ? "wonyapay" : "cinetpay") as "wonyapay" | "cinetpay",
    devLocal,
  };
}

/**
 * Paiement simulé (aucun argent transféré) : toujours permis en local, refusé en production sauf choix explicite
 * PAYMENT_SIMULATION=1 sur l'hébergeur. Sans ce verrou, n'importe quel organisateur activerait ses événements sans payer.
 */
export function simulationAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENT_SIMULATION === "1";
}

export async function stripeCheckout(o: { reference: string; amountCents: number; currency: string; title: string; successUrl: string; cancelUrl: string }): Promise<string> {
  const body = new URLSearchParams({
    mode: "payment",
    client_reference_id: o.reference,
    "metadata[reference]": o.reference,
    "payment_intent_data[metadata][reference]": o.reference,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": o.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(o.amountCents),
    "line_items[0][price_data][product_data][name]": `Skyevenapp · ${o.title}`.slice(0, 120),
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": o.reference },
    body,
  });
  const j = await res.json();
  if (!res.ok || !j.url) throw new Error("stripe");
  return j.url as string;
}

export async function cinetpayCheckout(o: { reference: string; amountCents: number; currency: string; title: string; returnUrl: string }): Promise<string> {
  const res = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: o.reference,
      amount: Math.round(o.amountCents / 100),
      currency: o.currency,
      description: `Skyevenapp ${o.reference}`,
      channels: "MOBILE_MONEY",
      notify_url: `${(process.env.ORGANIZER_ORIGIN || "").replace(/\/$/, "")}/api/webhooks/cinetpay`,
      return_url: o.returnUrl,
    }),
  });
  const j = await res.json();
  if (!res.ok || j.code !== "201" || !j.data?.payment_url) throw new Error("cinetpay");
  return j.data.payment_url as string;
}

const WONYA_API = "https://api.wonyasoft.com/v1";

export { rdcPhone } from "./networks";

/** Erreur de l'API Wonya : `code` stable (invalid_payment, payment_rejected…), `status` HTTP (0 : pas de réponse). */
export class WonyaError extends Error {
  constructor(public code: string, public status: number) { super(`wonyapay ${status} ${code}`); }
}

/**
 * Demande C2B : Wonya envoie la demande sur le téléphone du payeur et répond 202 (transmise, pas encore payée).
 * La référence Skyevenapp sert aussi de clé d'idempotence. Renvoie l'identifiant Wonya à 12 chiffres.
 */
export async function wonyapayCollect(o: { reference: string; amountCents: number; currency: string; phone: string }): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${WONYA_API}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WONYAPAY_TOKEN}`, "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": o.reference },
      body: JSON.stringify({ reference: o.reference, amount: o.amountCents / 100, currency: o.currency, type: "C2B", phoneNumber: o.phone, description: `Skyevenapp ${o.reference}` }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WonyaError("network", 0);
  }
  const j = await res.json().catch(() => null);
  if (!res.ok || !/^\d{12}$/.test(String(j?.id ?? ""))) throw new WonyaError(String(j?.code || "unexpected"), res.status);
  return String(j.id);
}

export type WonyaPayment = { id: string; merchantReference: string; kind: string; status: string; amount: number; currency: string };

/** Statut connu le plus récent d'un paiement Wonya (null : inconnu de ce projet). */
export async function wonyapayPayment(id: string): Promise<WonyaPayment | null> {
  if (!/^\d{12}$/.test(id)) return null;
  const res = await fetch(`${WONYA_API}/payments/${id}`, {
    headers: { Authorization: `Bearer ${process.env.WONYAPAY_TOKEN}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new WonyaError("lookup", res.status);
  return res.json();
}

/** Message affiché à l'organisateur après un échec de wonyapayCollect. */
export function wonyaMessage(e: unknown): string {
  const err = e instanceof WonyaError ? e : new WonyaError("unexpected", 0);
  if (err.code === "invalid_payment") return "Numéro refusé : indiquez un numéro mobile money de RDC valide (0XXXXXXXXX ou +243XXXXXXXXX).";
  if (err.status >= 400 && err.status < 500) {
    console.error("wonyapay", err.message); // token, droits ou référence : problème de configuration
    return "Le paiement mobile money est momentanément indisponible. Rien n’a été débité : réessayez plus tard ou payez par carte.";
  }
  // 5xx ou pas de réponse : la demande a pu partir ; la notification signée confirmera le paiement si le client le valide
  return "Wonya Pay n’a pas confirmé l’envoi de la demande. Si elle apparaît sur votre téléphone, vous pouvez la valider : le paiement sera pris en compte. Sinon, réessayez dans un instant.";
}
