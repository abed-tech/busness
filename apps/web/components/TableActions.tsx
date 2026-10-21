"use client";
import { useActionState, useRef, type FormEvent, type ReactNode } from "react";
import type { ActionState } from "@/components/ConfirmAction";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

/** Coupure réseau ou serveur injoignable : message explicite (rien n'a été enregistré) ; les redirections passent. */
function withNetworkError(action: Action): Action {
  return async (p, fd) => {
    try { return await action(p, fd); }
    catch (e) {
      if (String((e as { digest?: string })?.digest || "").startsWith("NEXT_")) throw e;
      return { ok: false, message: "Connexion au serveur impossible : rien n’a été enregistré. Vérifiez la connexion et réessayez." };
    }
  };
}

/**
 * Carte entièrement cliquable qui envoie une action (choisir une table, lancer un placement, confirmer une permutation).
 * Un seul envoi à la fois ; le serveur revérifie tout et renvoie un message clair en cas de refus ou d'échec réseau.
 */
export function CardAction({ action, hidden, className, pendingLabel, children }: { action: Action; hidden: Record<string, string>; className?: string; pendingLabel?: string; children: ReactNode }) {
  const [state, run, pending] = useActionState(withNetworkError(action), null);
  const sent = useRef(false);
  if (!pending) sent.current = false;
  const once = (e: FormEvent) => { if (sent.current || pending) { e.preventDefault(); return; } sent.current = true; };
  return (
    <form action={run} onSubmit={once} className="cardform">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className={className || "pickcard"} disabled={pending} aria-busy={pending}>
        {children}
        {pending && <span className="hint pick-pending"><span className="spin" aria-hidden="true" />{pendingLabel || "Enregistrement…"}</span>}
      </button>
      {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="alert">{state.message}</div>}
    </form>
  );
}
