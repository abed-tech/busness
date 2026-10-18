// Vérifications des notifications des prestataires de paiement (Web Crypto, sans dépendance).
// Module pur : testé localement (apps/web/lib/webhooks/verify.test.mjs, commande « pnpm test:functions »).

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparaison en temps constant. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * En-tête Stripe-Signature : "t=<horodatage>,v1=<hmac>[,v1=...]".
 * Signature = HMAC-SHA256(secret, "<t>.<corps brut>"). Rejette les notifications de plus de `toleranceSec`.
 */
export async function verifyStripe(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const v1 = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !v1.length) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((v) => safeEqual(v, expected));
}

/** Statut Cérémonia déduit d'un événement Stripe (null : événement ignoré). */
export function stripeOutcome(ev: { type: string; data: { object: Record<string, any> } }):
  null | { reference: string; status: "succeeded" | "failed" | "refunded"; providerRef: string; amountCents: number | null } {
  const o = ev.data.object || {};
  const reference = o.client_reference_id || o.metadata?.reference;
  if (!reference) return null;
  switch (ev.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (o.payment_status !== "paid") return null; // paiement différé : attendre async_payment_succeeded
      return { reference, status: "succeeded", providerRef: o.payment_intent || o.id, amountCents: o.amount_total ?? null };
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return { reference, status: "failed", providerRef: o.payment_intent || o.id, amountCents: null };
    case "charge.refunded":
      if (!o.refunded) return null; // remboursement partiel : traité manuellement
      return { reference, status: "refunded", providerRef: o.payment_intent || o.id, amountCents: null };
    default:
      return null;
  }
}

/**
 * En-tête x-token CinetPay : HMAC-SHA256(clé secrète, concaténation des champs dans l'ordre documenté).
 * La source de vérité reste l'appel de vérification /v2/payment/check (voir la fonction).
 */
export const CINETPAY_TOKEN_FIELDS = ["cpm_site_id", "cpm_trans_id", "cpm_trans_date", "cpm_amount", "cpm_currency", "signature", "payment_method",
  "cel_phone_num", "cpm_phone_prefixe", "cpm_language", "cpm_version", "cpm_payment_config", "cpm_page_action", "cpm_custom", "cpm_designation", "cpm_error_message"];

export async function verifyCinetpayToken(fields: Record<string, string>, token: string | null, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const data = CINETPAY_TOKEN_FIELDS.map((k) => fields[k] ?? "").join("");
  return safeEqual(token, await hmacHex(secret, data));
}

/** Statut Cérémonia déduit de la réponse de /v2/payment/check. */
export function cinetpayOutcome(check: { code?: string; data?: { status?: string; amount?: string | number; currency?: string; operator_id?: string; payment_method?: string } }):
  null | { status: "succeeded" | "failed"; amountMinor: number | null; currency: string | null; providerRef: string | null } {
  const st = check?.data?.status;
  const amount = check?.data?.amount != null ? Number(check.data.amount) : null;
  if (st === "ACCEPTED") return { status: "succeeded", amountMinor: amount, currency: check.data!.currency || null, providerRef: check.data!.operator_id || null };
  if (st === "REFUSED" || st === "CANCELED") return { status: "failed", amountMinor: null, currency: null, providerRef: check.data!.operator_id || null };
  return null; // en attente : rien à faire
}

/** CinetPay exprime les montants en unités de la devise ; Cérémonia stocke des centièmes. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
