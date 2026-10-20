/**
 * Envoi d'e-mails (confirmation d'inscription, mot de passe oublié) par l'API HTTP de Resend.
 * Variables : RESEND_API_KEY et MAIL_FROM (ex. « Skyevenapp <no-reply@votre-domaine> »).
 * Sans configuration : en local, le lien s'affiche dans le terminal ; en production, aucun e-mail n'est envoyé
 * et les fonctions qui en dépendent l'indiquent honnêtement à l'utilisateur.
 */
export function mailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(o: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[e-mail local, non envoyé] à ${o.to} — ${o.subject}\n${o.text}\n`);
      return true;
    }
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [o.to], subject: o.subject, text: o.text, html: o.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error("E-mail refusé par le fournisseur :", r.status);
    return r.ok;
  } catch (e) {
    console.error("E-mail : fournisseur injoignable", (e as Error).message);
    return false;
  }
}
