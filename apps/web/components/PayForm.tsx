"use client";
import { useActionState, useRef, useState, type FormEvent } from "react";
import type { ActionState } from "@/components/ConfirmAction";
import { NETWORKS, networkOf, networkLabel, rdcPhone, type NetworkId } from "@/lib/networks";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

const Logo = ({ id }: { id: NetworkId }) => <img className="pay-logo" src={`/networks/${id}.svg`} alt="" width={56} height={56} />;

/**
 * Paiement mobile money en deux écrans : choix du réseau, puis numéro, montant (lecture seule) et « Débiter mon compte ».
 * Le montant affiché vient de la base ; le serveur le recalcule de toute façon (create_checkout).
 * askPhone : Wonya envoie la demande au numéro saisi ; sinon le prestataire (CinetPay) le demande sur sa page.
 * note : ce que couvre le montant (prix unique, paiement en une fois), affiché dès le choix du réseau.
 */
export function PayForm({ action, eventId, amount, note, askPhone, backHref }: { action: Action; eventId: string; amount: string; note?: string; askPhone: boolean; backHref: string }) {
  const [state, run, pending] = useActionState(action, null);
  const [network, setNetwork] = useState<NetworkId | null>(null);
  const [phone, setPhone] = useState("");
  const sent = useRef(false);
  if (!pending) sent.current = false;

  if (!network) {
    return (
      <div className="pay-step">
        <a className="pay-arrow" href={backHref} aria-label="Retour">←</a>
        <h1 className="pay-h">Choisissez votre réseau</h1>
        <div className="pay-price"><output className="pay-total">{amount}</output>{note && <p className="hint">{note}</p>}</div>
        <div className="pay-nets">
          {NETWORKS.map((n) => (
            <button key={n.id} type="button" className="pay-net" onClick={() => setNetwork(n.id)}>
              <Logo id={n.id} /><span>{n.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const detected = networkOf(phone);
  const mismatch = askPhone && !!detected && detected !== network;
  const ready = !askPhone || (!!rdcPhone(phone) && !mismatch);
  const onSubmit = (e: FormEvent) => {
    if (sent.current || pending || !ready) { e.preventDefault(); return; }
    sent.current = true; // une seule demande par clic : jamais deux débits pour un double appui
  };

  return (
    <form action={run} onSubmit={onSubmit} className="pay-step">
      <button type="button" className="pay-arrow" onClick={() => setNetwork(null)} disabled={pending} aria-label="Changer de réseau">←</button>
      <div className="pay-chosen"><Logo id={network} /><span>{networkLabel(network)}</span></div>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="method" value="mobile_money" />
      <input type="hidden" name="network" value={network} />
      {askPhone && (
        <div className="fld">
          <label htmlFor="pay-phone">Numéro {networkLabel(network)}</label>
          <input id="pay-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0XXXXXXXXX" maxLength={16} required autoFocus
            value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} aria-invalid={mismatch || undefined} />
          {mismatch && <span className="pay-warn" role="alert">Ce numéro est un numéro {networkLabel(detected)}.</span>}
        </div>
      )}
      <div className="fld">
        <span className="lbl">Montant</span>
        <output className="pay-total" aria-live="polite">{amount}</output>
        {note && <span className="hint">{note}</span>}
      </div>
      {state?.message && <div className="notice bad" role="alert">{state.message}</div>}
      <button className="btn pay-main" type="submit" disabled={pending || !ready} aria-busy={pending}>
        {pending ? <><span className="spin" aria-hidden="true" />Envoi de la demande…</> : "Débiter mon compte"}
      </button>
    </form>
  );
}
