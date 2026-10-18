"use client";
import { useActionState } from "react";
import { createProfile } from "./actions";
import type { FormState } from "../(auth)/actions";

export function OnboardingForm({ username, phone }: { username: string; phone: string }) {
  const [s, run, pending] = useActionState<FormState, FormData>(createProfile, null);
  return (
    <form action={run} className="form">
      <div className="fld"><label htmlFor="u">Nom d’utilisateur</label><input id="u" name="username" defaultValue={username} required minLength={2} maxLength={40} /></div>
      <div className="fld"><label htmlFor="f">Nom complet (facultatif)</label><input id="f" name="full_name" maxLength={120} /></div>
      <div className="fld"><label htmlFor="p">Téléphone (facultatif)</label><input id="p" name="phone" type="tel" defaultValue={phone} maxLength={20} /></div>
      {s?.message && <div className="notice bad" role="alert">{s.message}</div>}
      <button className="btn" disabled={pending}>{pending ? "Enregistrement…" : "Continuer"}</button>
    </form>
  );
}
