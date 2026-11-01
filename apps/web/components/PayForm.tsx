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
  const valid = !!rdcPhone(phone);
  const mismatch = mobile && valid && !!network && !!detected && detected !== network;
  const ready = !mobile || (valid && !!network && !mismatch);

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
        <fieldset className="pay-set">
          <legend className="lbl">Moyen de paiement</legend>
          <div className="choice">
            {methods.map((m) => (
              <label key={m}>
                <input type="radio" name="_method" checked={method === m} onChange={() => setMethod(m)} disabled={pending} />
                <span><b>{m === "mobile_money" ? "Mobile money" : "Carte bancaire"}</b><small>{m === "mobile_money" ? "M-Pesa, Orange, Airtel, Afrimoney" : "Visa, Mastercard"}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {mobile && <>
        <fieldset className="pay-set">
          <legend className="lbl">Réseau</legend>
          <div className="choice pay-nets">
            {NETWORKS.map((n) => (
              <label key={n.id}>
                <input type="radio" name="_network" checked={network === n.id} onChange={() => setNetwork(n.id)} disabled={pending} />
                <span><b>{n.label}</b><small>{n.operator} · 0{n.prefixes.join(", 0")}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="fld">
          <label htmlFor="pay-phone">Numéro mobile money</label>
          <input id="pay-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0991234567" maxLength={16} required
            value={phone} onChange={(e) => onPhone(e.target.value)} disabled={pending} aria-invalid={mismatch || undefined} aria-describedby="pay-phone-hint" />
          <span id="pay-phone-hint" className={mismatch ? "pay-warn" : "hint"} role={mismatch ? "alert" : undefined}>
            {mismatch
              ? `Ce numéro est un numéro ${networkLabel(detected)} : choisissez ${networkLabel(detected)} ou saisissez un numéro ${networkLabel(network)}.`
              : "Format 0XXXXXXXXX ou +243XXXXXXXXX. La demande de paiement arrive sur ce téléphone."}
          </span>
        </div>
      </>}

      {method === "card" && <p className="hint">Vous serez redirigé vers la page sécurisée de notre prestataire pour saisir votre carte.</p>}

      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn pay-main" type="submit" disabled={pending || !ready} aria-busy={pending}>
        {pending
          ? <><span className="spin" aria-hidden="true" />{mobile ? "Envoi de la demande…" : "Redirection…"}</>
          : <>Payer {amount}</>}
      </button>
      {mobile && <p className="hint">Après avoir cliqué, validez la demande sur votre téléphone avec votre code mobile money. Rien n’est débité sans votre confirmation.</p>}
    </form>
  );
}
