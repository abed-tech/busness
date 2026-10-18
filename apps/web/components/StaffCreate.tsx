"use client";
import { useActionState, useState } from "react";
import { createStaff, type CreatedState } from "@/app/(org)/events/[id]/staff/actions";

const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;

/** Création d'un accès : le code et le mot de passe sont affichés une seule fois, à transmettre en trois messages séparés. */
export function StaffCreate({ eventId, role, label, placeholder, linkBase, eventTitle }: { eventId: string; role: string; label: string; placeholder: string; linkBase: string; eventTitle: string }) {
  const [s, run, pending] = useActionState<CreatedState, FormData>(createStaff, null);
  const [closed, setClosed] = useState<string | null>(null);
  const c = s?.created && s.created.id !== closed ? s.created : null;
  if (c) {
    const link = linkBase + c.id;
    return (
      <section className="card form">
        <h2>Accès créé : {c.name}</h2>
        <div className="codebox"><span>Code</span><b>{c.code}</b></div>
        <div className="codebox"><span>Mot de passe</span><b>{c.password}</b></div>
        <p className="hint">Envoyez ces trois éléments dans trois messages séparés. Le mot de passe ne sera plus jamais affiché.</p>
        <div className="row">
          <a className="btn" href={wa(`${label} pour « ${eventTitle} » : ouvrez ce lien le jour J ${link}`)} target="_blank" rel="noopener noreferrer">1. Envoyer le lien</a>
          <a className="btn" href={wa(`Code d’accès : ${c.code}`)} target="_blank" rel="noopener noreferrer">2. Envoyer le code</a>
          <a className="btn" href={wa(`Mot de passe : ${c.password}`)} target="_blank" rel="noopener noreferrer">3. Envoyer le mot de passe</a>
        </div>
        <div><button className="btn ghost" onClick={() => setClosed(c.id)}>Terminé</button></div>
      </section>
    );
  }
  return (
    <section className="card form">
      <h2>Nouveau {label.toLowerCase()}</h2>
      <form action={run} className="form">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="role" value={role} />
        <div className="grid g2">
          <div className="fld"><label htmlFor="st-n">Nom</label><input id="st-n" name="name" maxLength={60} required placeholder={placeholder} autoComplete="off" /></div>
          <div className="fld"><label htmlFor="st-p">Mot de passe initial</label><input id="st-p" name="password" type="text" minLength={6} maxLength={64} required placeholder="6 caractères minimum" autoComplete="new-password" spellCheck={false} /></div>
        </div>
        <p className="hint">Le mot de passe est haché (bcrypt) avant d’être enregistré. Un code d’accès est généré automatiquement.</p>
        {s?.ok === false && <div className="notice bad" role="alert">{s.message}</div>}
        <div><button className="btn" disabled={pending}>{pending ? "Création…" : "Créer l’accès"}</button></div>
      </form>
    </section>
  );
}
