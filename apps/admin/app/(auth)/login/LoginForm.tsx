"use client";
import { useActionState } from "react";
import { login, type AuthState } from "../actions";

export function LoginForm() {
  const [state, run, pending] = useActionState<AuthState, FormData>(login, null);
  return (
    <form action={run} className="form" noValidate>
      <div className="fld"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="fld"><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} /></div>
      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Vérification…" : "Se connecter"}</button>
    </form>
  );
}
