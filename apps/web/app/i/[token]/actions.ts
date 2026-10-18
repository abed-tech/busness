"use server";
import { revalidatePath } from "next/cache";
import { anonClient } from "@/lib/data/server";
import { humanError } from "@/lib/auth";
import type { ActionState } from "@/components/ConfirmAction";

/** Réponse de l'invité : la base vérifie le jeton, le nombre de choix et qu'ils appartiennent à l'événement. */
export async function submitRsvp(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") || "");
  const answer = fd.get("answer");
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return { ok: false, message: "Invitation introuvable." };
  if (answer !== "yes" && answer !== "no") return { ok: false, message: "Choisissez votre réponse." };
  const ids = (k: string) => fd.getAll(k).map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)).slice(0, 4);
  const sb = await anonClient();
  const { error } = await sb.rpc("submit_rsvp", { p_token: token, p_answer: answer, p_drinks: ids("drinks"), p_dishes: ids("dishes") });
  if (error) return { ok: false, message: humanError(error.message, error.code) };
  revalidatePath(`/i/${token}`);
  return { ok: true, message: answer === "yes" ? "Merci ! Votre présence est confirmée. Votre QR code d’accès est ci-dessous." : "Merci de nous avoir prévenus." };
}
