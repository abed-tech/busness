"use server";
import { revalidatePath } from "next/cache";
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

const UUID = /^[0-9a-f-]{36}$/;

/**
 * « Générer mon invitation » : ouvre le paiement simulé d'un brouillon. Ne crée pas l'événement.
 * Le montant et le récapitulatif sont calculés par la base (start_simulated_checkout) ; un paiement en attente
 * au même montant est repris, ce qui protège des clics multiples et des actualisations.
 */
export async function startSimulatedPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id"));
  if (!UUID.test(id)) return { ok: false, message: "Événement introuvable." };
  const r = await rpc<{ ok: boolean; reference?: string; already_active?: boolean }>("start_simulated_checkout", { p_event: id });
  if (!r.ok) return { ok: false, message: r.message };
  if (r.data.already_active) redirect(`/events/${id}`);
  redirect(`/events/${id}/pay/simulate?ref=${encodeURIComponent(r.data.reference || "")}`);
}

/**
 * Issue du paiement simulé choisie par l'organisateur : réussi, échoué ou annulé.
 * La base vérifie le propriétaire, l'état du paiement et le montant, puis crée définitivement l'événement en cas de réussite.
 * Rejouer la requête (double clic, actualisation) ne crée jamais un second événement ni un second paiement.
 */
export async function completeSimulatedPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOrganizer();
  const id = String(fd.get("event_id")), ref = String(fd.get("ref") || ""), outcome = String(fd.get("outcome") || "");
  if (!UUID.test(id) || !/^[A-Z0-9-]{4,40}$/.test(ref)) return { ok: false, message: "Paiement introuvable." };
  if (!["succeeded", "failed", "cancelled"].includes(outcome)) return { ok: false, message: "Choix de paiement invalide." };
  const r = await rpc<{ ok: boolean; status: string; error?: string }>("complete_simulated_payment", { p_reference: ref, p_outcome: outcome });
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/events");
  revalidatePath(`/events/${id}`, "layout");
  if (!r.data.ok) return { ok: false, message: r.data.error || "Le paiement n’a pas pu être enregistré." };
  redirect(`/events/${id}/pay/simulate?ref=${encodeURIComponent(ref)}`);
}
