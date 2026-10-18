"use client";
import { useActionState, useId, useRef } from "react";

export type ActionState = { ok?: boolean; message?: string } | null;

/** Bouton qui ouvre une confirmation, puis exécute une action serveur ; affiche le résultat. */
export function ConfirmAction({
  action, label, title, body, confirmLabel, danger, needText, needReason, hidden,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label: string; title: string; body: string; confirmLabel: string;
  danger?: boolean; needText?: string; needReason?: boolean; hidden?: Record<string, string>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [state, run, pending] = useActionState(action, null);
  return (
    <>
      <button type="button" className={"btn sm " + (danger ? "danger" : "ghost")} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} className="dlg" aria-labelledby={"dlg" + uid}>
        <form action={run} className="form">
          <h2 id={"dlg" + uid} style={{ fontSize: "1.5rem" }}>{title}</h2>
          <p className="hint" style={{ fontSize: ".92rem" }}>{body}</p>
          {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {needReason && <div className="fld"><label htmlFor={"r" + uid}>Motif</label><textarea id={"r" + uid} name="reason" required minLength={3} maxLength={500} /></div>}
          {needText && <div className="fld"><label htmlFor={"t" + uid}>Recopiez « {needText} »</label><input id={"t" + uid} name="confirm" required autoComplete="off" /></div>}
          {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="status">{state.message}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Annuler</button>
            <button type="submit" className={"btn" + (danger ? " danger" : "")} disabled={pending}>{pending ? "En cours…" : confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
