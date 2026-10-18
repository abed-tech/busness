"use client";
import { useActionState } from "react";
import { login, signup, forgot, resetPassword, type FormState } from "./actions";

function Msg({ s }: { s: FormState }) {
  return s?.message ? <div className={"notice " + (s.ok ? "ok" : "bad")} role="alert">{s.message}</div> : null;
}

export function LoginForm({ next }: { next?: string }) {
  const [s, run, pending] = useActionState<FormState, FormData>(login, null);
  return (
    <form action={run} className="form">
      <input type="hidden" name="next" value={next || ""} />
      <div className="fld"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="fld"><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <Msg s={s} />
      <button className="btn" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</button>
    </form>
  );
}

export function SignupForm() {
  const [s, run, pending] = useActionState<FormState, FormData>(signup, null);
  if (s?.ok) return <Msg s={s} />;
  return (
    <form action={run} className="form">
      <div className="fld"><label htmlFor="username">Nom d’utilisateur</label><input id="username" name="username" required minLength={2} maxLength={40} autoComplete="nickname" /></div>
      <div className="fld"><label htmlFor="phone">Téléphone (facultatif)</label><input id="phone" name="phone" type="tel" maxLength={20} placeholder="+243 81 234 5678" autoComplete="tel" /></div>
      <div className="fld"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
      <div className="fld"><label htmlFor="password">Mot de passe (8 caractères minimum)</label><input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></div>
      <div className="fld"><label htmlFor="password2">Confirmer le mot de passe</label><input id="password2" name="password2" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></div>
      <Msg s={s} />
      <button className="btn" disabled={pending}>{pending ? "Création…" : "Créer mon compte"}</button>
    </form>
  );
}

export function ForgotForm() {
  const [s, run, pending] = useActionState<FormState, FormData>(forgot, null);
  return (
    <form action={run} className="form">
      <div className="fld"><label htmlFor="email">E-mail du compte</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
      <Msg s={s} />
      <button className="btn" disabled={pending}>{pending ? "Envoi…" : "Recevoir un lien"}</button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, run, pending] = useActionState<FormState, FormData>(resetPassword, null);
  return (
    <form action={run} className="form">
      <input type="hidden" name="token" value={token} />
      <div className="fld"><label htmlFor="password">Nouveau mot de passe</label><input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></div>
      <div className="fld"><label htmlFor="password2">Confirmer</label><input id="password2" name="password2" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></div>
      <Msg s={s} />
      <button className="btn" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}
