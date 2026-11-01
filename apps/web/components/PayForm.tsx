"use client";
import { useActionState, useRef, useState, type FormEvent } from "react";
import type { ActionState } from "@/components/ConfirmAction";
import { NETWORKS, networkOf, networkLabel, rdcPhone, type NetworkId } from "@/lib/networks";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;
type Method = "mobile_money" | "card";

/**
 * Formulaire de la page de paiement : moyen de paiement, puis (mobile money par Wonya) réseau et numéro.
 * Le réseau suit le préfixe saisi ; un numéro d'un autre réseau est signalé avant l'envoi de la demande.
 * Le montant affiché vient de la base ; le serveur le recalcule de toute façon (create_checkout).
 */
export function PayForm({ action, eventId, amount, methods, askPhone }: { action: Action; eventId: string; amount: string; methods: Method[]; askPhone: boolean }) {
  const [state, run, pending] = useActionState(action, null);
  const [method, setMethod] = useState<Method>(methods[0]);
  const [network, setNetwork] = useState<NetworkId | null>(null);
  const [phone, setPhone] = useState("");
  const sent = useRef(false);
  if (!pending) sent.current = false;

  const mobile = method === "mobile_money" && askPhone;
  const detected = networkOf(phone);
  const mismatch = mobile && !!network && !!detected && detected !== network;
  const ready = !mobile || (!!rdcPhone(phone) && !!network && !mismatch);

  const onPhone = (v: string) => {
    setPhone(v);
    const d = networkOf(v);
    if (d) setNetwork(d); // le préfixe désigne le réseau : inutile de le choisir à la main
  };
  const onSubmit = (e: FormEvent) => {
    if (sent.current || pending || !ready) { e.preventDefault(); return; }
    sent.current = true;
  };

  return (
    <form action={run} onSubmit={onSubmit} className="form">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="method" value={method} />
      {mobile && network && <input type="hidden" name="network" value={network} />}

      {methods.length > 1 && (
        <div className="seg pay-seg" role="group" aria-label="Moyen de paiement">
          {methods.map((m) => (
            <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} disabled={pending}>
              {m === "mobile_money" ? "Mobile money" : "Carte"}
            </button>
          ))}
        </div>
      )}

      {mobile && <>
        <div className="choice pay-nets" role="radiogroup" aria-label="Réseau">
          {NETWORKS.map((n) => (
            <label key={n.id}>
              <input type="radio" name="_network" checked={network === n.id} onChange={() => setNetwork(n.id)} disabled={pending} />
              <span>{n.label}</span>
            </label>
          ))}
        </div>
        <div className="fld">
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Numéro : 0991234567" maxLength={16} required
            value={phone} onChange={(e) => onPhone(e.target.value)} disabled={pending} aria-label="Numéro mobile money" aria-invalid={mismatch || undefined} />
          {mismatch && <span className="pay-warn" role="alert">Numéro {networkLabel(detected)} : changez de réseau ou de numéro.</span>}
        </div>
      </>}

      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn pay-main" type="submit" disabled={pending || !ready} aria-busy={pending}>
        {pending ? <><span className="spin" aria-hidden="true" />Envoi…</> : <>Payer {amount}</>}
      </button>
      {mobile && <p className="hint pay-note">Validez ensuite la demande sur votre téléphone.</p>}
    </form>
  );
}
