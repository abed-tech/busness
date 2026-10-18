"use server";
import { redirect } from "next/navigation";
import { requireOrganizer, rpc, origin } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { paymentMethods, stripeCheckout, cinetpayCheckout } from "@/lib/payments";
import type { ActionState } from "@/components/ConfirmAction";

/**
 * Démarre un paiement : le montant est calculé par la base (create_checkout), jamais par le navigateur.
 * Le paiement n'est confirmé que par le webhook du prestataire (signature vérifiée).
 */
export async function startPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  const method = String(fd.get("method"));
  const m = paymentMethods();
  if (method !== "card" && method !== "mobile_money") return { ok: false, message: "Moyen de paiement invalide." };
  if (!m[method]) return { ok: false, message: "Ce moyen de paiement n’est pas encore configuré sur la plateforme." };
  const r = await rpc<{ ok: boolean; error?: string; reference: string; amount_cents: number; currency: string }>("create_checkout", {
    p_event: id, p_method: method, p_provider: method === "card" ? "stripe" : "cinetpay",
  });
  if (!r.ok) return { ok: false, message: r.message };
  if (!r.data.ok) return { ok: false, message: r.data.error || "Rien à régler." };
  const ret = `${origin()}/events/${id}/pay/return?ref=${r.data.reference}`;
  if (m.devLocal) redirect(ret + "&dev=1"); // test local : confirmation simulée par la commande documentée (jamais en production)
  const sb = await serverClient();
  const { data: ev } = await sb.from("events").select("title").eq("id", id).single();
  let url: string;
  try {
    url = method === "card"
      ? await stripeCheckout({ reference: r.data.reference, amountCents: r.data.amount_cents, currency: r.data.currency, title: ev?.title || "", successUrl: ret, cancelUrl: `${origin()}/events/${id}?pay=cancel` })
      : await cinetpayCheckout({ reference: r.data.reference, amountCents: r.data.amount_cents, currency: r.data.currency, title: ev?.title || "", returnUrl: ret });
  } catch {
    return { ok: false, message: "Le prestataire de paiement ne répond pas. Rien n’a été débité : réessayez dans un instant." };
  }
  redirect(url);
}
