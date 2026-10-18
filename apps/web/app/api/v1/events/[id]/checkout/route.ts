import { dataClient } from "@ceremonia/server";
import { requireApiOrganizer, apiError, json, dbErrorResponse, UUID } from "@/lib/api";
import { paymentMethods, stripeCheckout, cinetpayCheckout } from "@/lib/payments";
import { origin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/events/{id}/checkout   corps : { "method": "card" | "mobile_money" }
 * Démarre le règlement d'un événement et renvoie l'adresse de la page de paiement du prestataire.
 * Le montant est calculé par la base (create_checkout) ; le paiement n'est confirmé que par le webhook signé.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiOrganizer(req);
  if (me instanceof Response) return me;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return apiError(400, "bad_request", "Identifiant d’événement invalide.");
  let body: { method?: unknown };
  try { body = await req.json(); } catch { return apiError(400, "bad_request", "Corps JSON attendu."); }
  const method = body.method;
  if (method !== "card" && method !== "mobile_money") return apiError(400, "bad_request", "« method » doit valoir « card » ou « mobile_money ».");
  const m = paymentMethods();
  if (!m[method] || m.devLocal) return apiError(503, "payment_unavailable", "Ce moyen de paiement n’est pas encore configuré sur la plateforme.");

  const db = dataClient(me.ctx);
  const r = await db.rpc<{ ok: boolean; error?: string; reference: string; amount_cents: number; currency: string }>("create_checkout", {
    p_event: id, p_method: method, p_provider: method === "card" ? "stripe" : "cinetpay",
  });
  if (r.error) return dbErrorResponse(r.error);
  if (!r.data.ok) return apiError(409, "nothing_due", r.data.error || "Rien à régler.");
  const { data: ev } = await db.from("events").select("title").eq("id", id).maybeSingle();
  const ret = `${origin()}/events/${id}/pay/return?ref=${r.data.reference}`;
  try {
    const url = method === "card"
      ? await stripeCheckout({ reference: r.data.reference, amountCents: r.data.amount_cents, currency: r.data.currency, title: ev?.title || "", successUrl: ret, cancelUrl: `${origin()}/events/${id}?pay=cancel` })
      : await cinetpayCheckout({ reference: r.data.reference, amountCents: r.data.amount_cents, currency: r.data.currency, title: ev?.title || "", returnUrl: ret });
    return json({ reference: r.data.reference, amount_cents: r.data.amount_cents, currency: r.data.currency, payment_url: url }, 201);
  } catch {
    return apiError(502, "provider_unavailable", "Le prestataire de paiement ne répond pas. Rien n’a été débité : réessayez.");
  }
}

export function GET() { return apiError(405, "method_not_allowed", "Utilisez POST."); }
