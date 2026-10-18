// pnpm test:functions  (compile verify.ts avec esbuild, puis node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as V from "./.verify.mjs";

const sec = "whsec_test";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { client_reference_id: "CRM-ABCDEFGHJK", payment_status: "paid", amount_total: 500, payment_intent: "pi_1" } } });
const sign = (t, b = body, s = sec) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;

test("Stripe : signature valide acceptée", async () => {
  const now = 1_700_000_000;
  assert.equal(await V.verifyStripe(body, sign(now), sec, now), true);
});
test("Stripe : corps modifié, mauvais secret, horodatage trop ancien, en-tête absent → refus", async () => {
  const now = 1_700_000_000;
  assert.equal(await V.verifyStripe(body.replace("500", "5"), sign(now), sec, now), false);
  assert.equal(await V.verifyStripe(body, sign(now, body, "autre"), sec, now), false);
  assert.equal(await V.verifyStripe(body, sign(now - 301), sec, now), false);
  assert.equal(await V.verifyStripe(body, null, sec, now), false);
  assert.equal(await V.verifyStripe(body, sign(now), "", now), false);
});
test("Stripe : traduction des événements", () => {
  const ev = JSON.parse(body);
  assert.deepEqual(V.stripeOutcome(ev), { reference: "CRM-ABCDEFGHJK", status: "succeeded", providerRef: "pi_1", amountCents: 500 });
  ev.data.object.payment_status = "unpaid";
  assert.equal(V.stripeOutcome(ev), null, "paiement différé non confirmé");
  assert.equal(V.stripeOutcome({ type: "charge.refunded", data: { object: { metadata: { reference: "CRM-X" }, refunded: false } } }), null, "remboursement partiel ignoré");
  assert.equal(V.stripeOutcome({ type: "charge.refunded", data: { object: { metadata: { reference: "CRM-X" }, refunded: true, payment_intent: "pi" } } }).status, "refunded");
  assert.equal(V.stripeOutcome({ type: "customer.created", data: { object: { client_reference_id: "CRM-X" } } }), null);
});
test("CinetPay : jeton HMAC et lecture du statut vérifié", async () => {
  const f = { cpm_site_id: "123", cpm_trans_id: "CRM-ABCDEFGHJK", cpm_amount: "5", cpm_currency: "USD" };
  const tok = createHmac("sha256", "s3cret").update(V.CINETPAY_TOKEN_FIELDS.map((k) => f[k] ?? "").join("")).digest("hex");
  assert.equal(await V.verifyCinetpayToken(f, tok, "s3cret"), true);
  assert.equal(await V.verifyCinetpayToken({ ...f, cpm_amount: "500" }, tok, "s3cret"), false);
  assert.equal(await V.verifyCinetpayToken(f, null, "s3cret"), false);
  assert.deepEqual(V.cinetpayOutcome({ code: "00", data: { status: "ACCEPTED", amount: "5", currency: "USD", operator_id: "op1" } }), { status: "succeeded", amountMinor: 5, currency: "USD", providerRef: "op1" });
  assert.equal(V.cinetpayOutcome({ data: { status: "PENDING" } }), null);
  assert.equal(V.cinetpayOutcome({ data: { status: "REFUSED" } }).status, "failed");
  assert.equal(V.toCents(5), 500);
});
