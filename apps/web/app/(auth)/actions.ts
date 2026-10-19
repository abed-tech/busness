"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, dataClient, mailConfigured, sendMail } from "@ceremonia/server";
import { startSession, endSession } from "@/lib/data/server";
import { origin } from "@/lib/auth";

export type FormState = { ok?: boolean; message?: string } | null;

async function isAdminAccount(userId: string): Promise<boolean> {
  // lecture avec l'identité du compte : la règle RLS de admin_users n'autorise que sa propre ligne
  const { data } = await dataClient({ role: "authenticated", claims: { sub: userId } }).from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) }).safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { message: "E-mail ou mot de passe invalide." };
  const r = await auth.checkPassword(p.data.email, p.data.password);
  if (!r.ok) return { message: r.error === "rate_limited" ? "Trop de tentatives. Patientez quelques minutes." : "E-mail ou mot de passe incorrect." };
  if (!r.confirmed) return { message: "Confirmez d’abord votre adresse e-mail (lien reçu par e-mail)." };
  if (await isAdminAccount(r.userId)) return { message: "Ce compte ne peut pas se connecter ici." };
  await startSession(r.userId);
  // « Mes événements » est la page de reprise : on n'y renvoie pas vers la dernière page demandée.
  // Un compte sans profil est envoyé vers /onboarding par requireOrganizer (étape indispensable).
  redirect("/events");
}

const SignupSchema = z.object({
  username: z.string().trim().min(2, "Nom d’utilisateur : 2 caractères minimum.").max(40),
  phone: z.string().trim().max(20).regex(/^[+\d\s]*$/, "Téléphone invalide."),
  email: z.string().trim().email("E-mail invalide.").max(254),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum.").max(72),
});

/**
 * Inscription. Avec un service d'e-mail configuré (ou en local), l'adresse doit être confirmée par un lien.
 * Sans service d'e-mail en production, le compte est ouvert immédiatement (l'adresse n'est pas vérifiée).
 */
export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const p = SignupSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { message: p.error.issues[0]?.message };
  if (fd.get("password") !== fd.get("password2")) return { message: "Les deux mots de passe ne correspondent pas." };
  const verify = mailConfigured() || process.env.NODE_ENV !== "production";
  const r = await auth.createUser(p.data.email, p.data.password, !verify, { username: p.data.username, phone: p.data.phone });
  if (!r.ok) return { message: "Un compte existe déjà avec cet e-mail." };
  if (!verify) {
    await startSession(r.userId);
    redirect("/onboarding");
  }
  const token = await auth.createOneTimeToken(r.userId, "confirm", 60 * 24);
  const link = `${origin()}/auth/callback?type=confirm&token=${token}`;
  await sendMail({
    to: p.data.email, subject: "Confirmez votre adresse — Cérémonia",
    text: `Bonjour ${p.data.username},\n\nPour activer votre compte Cérémonia, ouvrez ce lien (valable 24 heures) :\n${link}\n\nSi vous n’êtes pas à l’origine de cette inscription, ignorez ce message.`,
  });
  return { ok: true, message: "Compte créé. Ouvrez le lien de confirmation envoyé à votre adresse e-mail pour terminer." };
}

export async function forgot(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") || "").trim();
  if (!z.string().email().safeParse(email).success) return { message: "E-mail invalide." };
  if (!mailConfigured() && process.env.NODE_ENV === "production") {
    return { message: "La réinitialisation par e-mail n’est pas encore disponible. Contactez l’équipe Cérémonia." };
  }
  const uid = await auth.userIdByEmail(email);
  if (uid) {
    const token = await auth.createOneTimeToken(uid, "recovery", 60);
    await sendMail({
      to: email, subject: "Réinitialisation du mot de passe — Cérémonia",
      text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${origin()}/reset?token=${token}\n\nSi vous n’avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.`,
    });
  }
  // même réponse que le compte existe ou non
  return { ok: true, message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé." };
}

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const pw = String(fd.get("password") || "");
  if (pw.length < 8 || pw.length > 72) return { message: "Mot de passe : 8 à 72 caractères." };
  if (pw !== fd.get("password2")) return { message: "Les deux mots de passe ne correspondent pas." };
  const uid = await auth.consumeOneTimeToken(String(fd.get("token") || ""), "recovery");
  if (!uid) return { message: "Lien expiré. Recommencez depuis « Mot de passe oublié »." };
  await auth.setPassword(uid, pw);
  await auth.confirmEmail(uid); // le lien prouve l'accès à la boîte e-mail
  await auth.deleteUserSessions(uid); // toutes les anciennes sessions sont fermées
  if (await isAdminAccount(uid)) redirect("/login?pw=1");
  await startSession(uid);
  redirect("/events?pw=1");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
