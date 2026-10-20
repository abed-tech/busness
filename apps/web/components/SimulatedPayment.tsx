"use client";
import { useActionState, useRef, type FormEvent } from "react";
import type { ActionState } from "@/components/ConfirmAction";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

/** Empêche un second envoi tant que le premier n'a pas répondu (double clic, double appui). */
function useOnce(pending: boolean) {
  const sent = useRef(false);
  if (!pending) sent.current = false;
  return (e: FormEvent) => { if (sent.current || pending) { e.preventDefault(); return; } sent.current = true; };
}

const Spinner = () => <span className="spin" aria-hidden="true" />;

/**
 * Barre fixe en bas de l'aperçu : « Générer mon invitation » ouvre le paiement (il ne crée pas l'événement).
 * L'aperçu au-dessus garde toute sa hauteur : la page réserve la place de la barre.
 */
export function GenerateBar({ action, eventId, editHref }: { action: Action; eventId: string; editHref: string }) {
  const [state, run, pending] = useActionState(action, null);
  const once = useOnce(pending);
  return (
    <form action={run} onSubmit={once} className="pv-bar" aria-label="Générer mon invitation">
      <input type="hidden" name="event_id" value={eventId} />
      {state?.message && <p className="pv-err" role="alert">{state.message}</p>}
      <div className="pv-bar-in">
        <a className="pv-edit" href={editHref}>Modifier</a>
        <button className="pv-cta" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? <><Spinner />Préparation du paiement…</> : "Générer mon invitation"}
        </button>
      </div>
    </form>
  );
}

/** Choix de l'issue du paiement simulé : tous les boutons sont bloqués pendant le traitement. */
export function SimulatedPayForm({ action, eventId, reference, amount }: { action: Action; eventId: string; reference: string; amount: string }) {
  const [state, run, pending] = useActionState(action, null);
  const once = useOnce(pending);
  return (
    <form action={run} onSubmit={once} className="form">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="ref" value={reference} />
      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn pay-main" type="submit" name="outcome" value="succeeded" disabled={pending} aria-busy={pending}>
        {pending ? <><Spinner />Traitement en cours…</> : <>Confirmer le paiement simulé · {amount}</>}
      </button>
      <div className="row pay-alt">
        <button className="btn ghost sm" type="submit" name="outcome" value="failed" disabled={pending}>Simuler un échec</button>
        <button className="btn ghost sm" type="submit" name="outcome" value="cancelled" disabled={pending}>Annuler le paiement</button>
      </div>
    </form>
  );
}

/** Nouvelle tentative après un échec ou une annulation : les informations saisies sont conservées. */
export function RetryPayForm({ action, eventId }: { action: Action; eventId: string }) {
  const [state, run, pending] = useActionState(action, null);
  const once = useOnce(pending);
  return (
    <form action={run} onSubmit={once} className="form">
      <input type="hidden" name="event_id" value={eventId} />
      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn pay-main" type="submit" disabled={pending} aria-busy={pending}>{pending ? <><Spinner />Préparation…</> : "Réessayer le paiement"}</button>
    </form>
  );
}
