import "server-only";

/** Moyens de paiement réellement configurés (clés présentes côté serveur). */
export function paymentMethods() {
  const devLocal = process.env.NODE_ENV !== "production" && process.env.DEV_PAYMENTS === "1";
  return {
    card: !!process.env.STRIPE_SECRET_KEY || devLocal,
    mobile_money: !!(process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID) || devLocal,
    devLocal,
  };
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
    "line_items[0][price_data][product_data][name]": `Cérémonia · ${o.title}`.slice(0, 120),
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
      description: `Ceremonia ${o.reference}`,
      channels: "MOBILE_MONEY",
      notify_url: `${(process.env.ORGANIZER_ORIGIN || "").replace(/\/$/, "")}/api/webhooks/cinetpay`,
      return_url: o.returnUrl,
    }),
  });
  const j = await res.json();
  if (!res.ok || j.code !== "201" || !j.data?.payment_url) throw new Error("cinetpay");
  return j.data.payment_url as string;
}
