"use client";
import { useActionState, useState, useTransition } from "react";
import { startEnroll, verify, type MfaState } from "./actions";

export function MfaForm({ factorId }: { factorId: string | null }) {
  const [enroll, setEnroll] = useState<MfaState>(null);
  const [pendingEnroll, startT] = useTransition();
  const [state, run, pending] = useActionState<MfaState, FormData>(verify, null);
  const fid = factorId || enroll?.enroll?.factorId || "";
  if (!fid) {
    return (
      <div className="form">
        <p className="hint" style={{ fontSize: ".92rem" }}>L’administration exige une application d’authentification (Google Authenticator, Authy, 1Password…).</p>
        {enroll?.message && <div className="notice bad">{enroll.message}</div>}
        <button className="btn" disabled={pendingEnroll} onClick={() => startT(async () => setEnroll(await startEnroll()))}>Activer</button>
      </div>
    );
  }
  return (
    <form action={run} className="form">
      {enroll?.enroll && (
        <>
          <p className="hint" style={{ fontSize: ".92rem" }}>Scannez ce code avec votre application, puis saisissez le code à 6 chiffres.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.enroll.qr} alt="QR code d’activation" width={180} height={180} style={{ background: "#fff", borderRadius: 8, padding: 8 }} />
          <p className="hint">Clé manuelle : <code>{enroll.enroll.secret}</code></p>
        </>
      )}
      <input type="hidden" name="factorId" value={fid} />
      <div className="fld"><label htmlFor="code">Code à 6 chiffres</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></div>
      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Vérification…" : "Valider"}</button>
    </form>
  );
}
