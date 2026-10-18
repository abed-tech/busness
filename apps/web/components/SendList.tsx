"use client";
import Link from "next/link";
import { useState } from "react";
import { markSent } from "@/app/(org)/events/[id]/send/actions";
import { dateTime } from "@/lib/format";

type Row = { id: string; name: string; whatsapp: string; sent: string | null; rsvp: string | null; issues: string[]; text: string };
const waUrl = (r: Row) => `https://wa.me/${r.whatsapp.replace(/^\+/, "")}?text=${encodeURIComponent(r.text)}`;

export function SendList({ eventId, rows, enabled }: { eventId: string; rows: Row[]; enabled: boolean }) {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const todo = rows.filter((r) => !r.issues.length && !r.sent && !sent[r.id]);

  async function open(r: Row) {
    setErr("");
    const w = window.open(waUrl(r), "_blank", "noopener");
    if (!w) { try { await navigator.clipboard.writeText(r.text); setErr("La fenêtre WhatsApp a été bloquée : le message a été copié, collez-le dans WhatsApp."); } catch { setErr("Autorisez les fenêtres pour ce site afin d’ouvrir WhatsApp."); } }
    const res = await markSent(eventId, [r.id]);
    if (!res.ok) { setErr(res.message || "Envoi non enregistré."); return false; }
    setSent((s) => ({ ...s, [r.id]: true }));
    return true;
  }

  const cur = queue && queue.length ? rows.find((r) => r.id === queue[0]) : null;
  return (
    <div className="form">
      {err && <div className="notice bad" role="alert">{err}</div>}
      {queue ? (
        <section className="card form">
          {cur ? (
            <>
              <h2>Invitation suivante · {rows.length - todo.length + 1}</h2>
              <p><b>{cur.name}</b> · {cur.whatsapp}</p>
              <div className="row">
                <button className="btn" disabled={!enabled} onClick={async () => { if (await open(cur)) setQueue(queue.slice(1)); }}>Ouvrir WhatsApp</button>
                <button className="btn ghost" onClick={() => setQueue(queue.slice(1))}>Passer</button>
                <button className="btn ghost" onClick={() => setQueue(null)}>Arrêter</button>
              </div>
              <p className="hint">Encore {queue.length} invitation(s). Revenez sur cette page après chaque message.</p>
            </>
          ) : <><h2>Terminé</h2><button className="btn ghost" onClick={() => setQueue(null)}>Fermer</button></>}
        </section>
      ) : (
        <button className="btn bigbtn" disabled={!enabled || !todo.length} onClick={() => setQueue(todo.map((r) => r.id))}>Envoyer les invitations prêtes ({todo.length})</button>
      )}
      <div className="list">
        {rows.map((r) => {
          const done = r.sent || sent[r.id];
          return (
            <div key={r.id} className="li">
              <span>
                <b>{r.name}</b>
                <small>{r.whatsapp || "sans WhatsApp"}{done ? ` · envoyée ${r.sent ? dateTime(r.sent) : "à l’instant"}` : ""}{r.rsvp === "yes" ? " · présence confirmée" : r.rsvp === "no" ? " · déclinée" : ""}</small>
                {r.issues.length > 0 && <small style={{ display: "block", color: "var(--warn)" }}>{r.issues.join(" ")}</small>}
              </span>
              {r.issues.length ? <Link className="btn ghost sm" href={`/events/${eventId}/guests/${r.id}`}>Compléter</Link>
                : <button className={"btn sm" + (done ? " ghost" : "")} disabled={!enabled} onClick={() => { if (!done || window.confirm(`L’invitation de ${r.name} a déjà été envoyée. La renvoyer ?`)) open(r); }}>{done ? "Renvoyer" : "Envoyer"}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
