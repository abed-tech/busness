"use server";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { auth } from "@ceremonia/server";
import { currentSession } from "@/lib/data/server";

export type MfaState = { message?: string; enroll?: { factorId: string; qr: string; secret: string } } | null;

/** Première connexion : génère le secret TOTP et son QR code (à scanner dans l'application d'authentification). */
export async function startEnroll(): Promise<MfaState> {
  const s = await currentSession();
  if (!s) redirect("/login");
  const f = await auth.enrollFactor(s.userId, s.email);
  if (!f) return { message: "Un appareil est déjà enregistré : saisissez le code qu’il affiche." };
  const qr = await QRCode.toDataURL(f.uri, { margin: 1, width: 200, errorCorrectionLevel: "M" });
  return { enroll: { factorId: f.factorId, qr, secret: f.secret } };
}

export async function verify(_: MfaState, fd: FormData): Promise<MfaState> {
  const s = await currentSession();
  if (!s) redirect("/login");
  const factorId = String(fd.get("factorId") || "");
  const code = String(fd.get("code") || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { message: "Saisissez les 6 chiffres affichés par votre application." };
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { message: "Vérification impossible. Réessayez." };
  const ok = await auth.verifyFactor(s.userId, factorId, code, s.sessionId);
  if (!ok) return { message: "Code incorrect ou expiré." };
  redirect("/");
}
