"use client";
import { useActionState, useState } from "react";
import { submitRsvp } from "@/app/i/[token]/actions";
import type { ActionState } from "@/components/ConfirmAction";

type Item = { id: string; kind: "drink" | "dish"; name: string };

export function RsvpForm({ token, preview, seats, offer, catalog, current, locked }: {
  token: string; preview: boolean; seats: number; offer: string; catalog: Item[];
  current: { rsvp: "yes" | "no" | null; drinks: string[]; dishes: string[] }; locked: boolean;
}) {
  const [answer, setAnswer] = useState<"yes" | "no" | "">(current.rsvp || "");
  const [editing, setEditing] = useState(!current.rsvp);
  const [s, run, pending] = useActionState<ActionState, FormData>(async (p: ActionState, fd: FormData) => { const r = await submitRsvp(p, fd); if (r?.ok) setEditing(false); return r; }, null);
  const drinks = catalog.filter((c) => c.kind === "drink"), dishes = catalog.filter((c) => c.kind === "dish");
  const needD = (offer === "both" || offer === "drinks") && drinks.length > 0, needF = (offer === "both" || offer === "food") && dishes.length > 0;
  const who = (i: number) => (seats > 1 ? (i === 0 ? "Personne 1" : `Personne ${i + 1}`) : "Vous");
  const nameOf = (id: string) => catalog.find((c) => c.id === id)?.name || "—";

  if (locked) return <p>Votre entrée a été validée. Bonne fête !</p>;
  if (!editing && current.rsvp) {
    return (
      <div className="form">
        {s?.message && <div className="notice ok" role="status">{s.message}</div>}
        <p>{current.rsvp === "yes" ? "Vous avez confirmé votre présence." : "Vous avez indiqué ne pas pouvoir venir."}</p>
        {current.rsvp === "yes" && (needD || needF) && <p className="hint">{needD && <>Boisson{seats > 1 ? "s" : ""} : {current.drinks.map(nameOf).join(" · ")}<br /></>}{needF && <>Plat{seats > 1 ? "s" : ""} : {current.dishes.map(nameOf).join(" · ")}</>}</p>}
        <div><button className="btn ghost sm" type="button" onClick={() => setEditing(true)}>Modifier ma réponse</button></div>
      </div>
    );
  }
  return (
    <form action={run} className="form">
      <input type="hidden" name="token" value={token} />
      <div className="choice">
        <label><input type="radio" name="answer" value="yes" checked={answer === "yes"} onChange={() => setAnswer("yes")} required /><span><b>Je serai présent{seats > 1 ? "s" : ""}</b><small>{seats > 1 ? "Nous viendrons à deux" : "Avec plaisir"}</small></span></label>
        <label><input type="radio" name="answer" value="no" checked={answer === "no"} onChange={() => setAnswer("no")} /><span><b>Je ne pourrai pas venir</b><small>Merci de prévenir</small></span></label>
      </div>
      {answer === "yes" && Array.from({ length: seats }, (_, i) => (
        <div key={i} className="grid g2">
          {needD && <div className="fld"><label htmlFor={"d" + i}>Boisson · {who(i)}</label><select id={"d" + i} name="drinks" required defaultValue={current.drinks[i] || ""}><option value="" disabled>Choisir</option>{drinks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>}
          {needF && <div className="fld"><label htmlFor={"f" + i}>Plat · {who(i)}</label><select id={"f" + i} name="dishes" required defaultValue={current.dishes[i] || ""}><option value="" disabled>Choisir</option>{dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>}
        </div>
      ))}
      {s?.ok === false && <div className="notice bad" role="alert">{s.message}</div>}
      <button className="btn" disabled={pending || preview || !answer}>{preview ? "Réponse désactivée dans l’aperçu" : pending ? "Envoi…" : "Envoyer ma réponse"}</button>
    </form>
  );
}
