"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markSent } from "@/app/(org)/events/[id]/send/actions";
import { dateTime } from "@/lib/format";

type Row = { id: string; name: string; whatsapp: string; sent: string | null; rsvp: string | null; code: string; table: number | null; link: string; issues: string[]; text: string };
const waUrl = (r: Row) => `https://wa.me/${r.whatsapp.replace(/^\+/, "")}?text=${encodeURIComponent(r.text)}`;
// sans numéro : WhatsApp demande à l'organisateur de choisir lui-même le destinataire
const waShareUrl = (r: Row) => `https://wa.me/?text=${encodeURIComponent(r.text)}`;
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Partage d'une invitation : exactement deux options, copier le lien ou l'envoyer via WhatsApp. */
function ShareMenu({ r, available }: { r: Row; available: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(""), 2600); };
  async function copy() {
    setOpen(false);
    try { await navigator.clipboard.writeText(r.link); flash("Lien copié ✓"); }
    catch { window.prompt("Copiez ce lien :", r.link); }
  }
  function whatsapp() {
    setOpen(false);
    const w = window.open(waShareUrl(r), "_blank", "noopener");
    flash(w ? "WhatsApp ouvert : choisissez le destinataire, puis envoyez." : "Fenêtre bloquée : autorisez les fenêtres pour ce site.");
  }
  return (
    <div className="share" ref={box}>
      <button type="button" className="iconbtn share-btn" aria-haspopup="menu" aria-expanded={open} disabled={!available}
        aria-label={`Partager l’invitation de ${r.name}`} title={available ? "Partager l’invitation" : "Lien inactif tant que l’événement n’est pas réglé"} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></svg>
      </button>
      {open && (
        <div className="share-menu" role="menu" aria-label={`Partager l’invitation de ${r.name}`}>
          <button type="button" role="menuitem" onClick={copy}>Copier le lien</button>
          <button type="button" role="menuitem" onClick={whatsapp}>Envoyer via WhatsApp</button>
        </div>
      )}
      {note && <span className="share-note" role="status">{note}</span>}
    </div>
  );
}

export function SendList({ eventId, rows, enabled, linksOpen }: { eventId: string; rows: Row[]; enabled: boolean; linksOpen: boolean }) {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const queueCard = useRef<HTMLElement>(null);
  const todo = rows.filter((r) => !r.issues.length && !r.sent && !sent[r.id]);

  async function open(r: Row) {
    if (busy) return false;
    setErr(""); setBusy(r.id);
    try {
      const w = window.open(waUrl(r), "_blank", "noopener");
      if (!w) { try { await navigator.clipboard.writeText(r.text); setErr("La fenêtre WhatsApp a été bloquée : le message a été copié, collez-le dans WhatsApp."); } catch { setErr("Autorisez les fenêtres pour ce site afin d’ouvrir WhatsApp."); } }
      const res = await markSent(eventId, [r.id]);
      if (!res.ok) { setErr(res.message || "Envoi non enregistré."); return false; }
      setSent((s) => ({ ...s, [r.id]: true }));
      return true;
    } finally { setBusy(null); }
  }
  function start() {
    setQueue(todo.map((r) => r.id));
    setTimeout(() => queueCard.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const status = (r: Row) => [r.sent || sent[r.id] ? "envoyée" : "", r.rsvp === "yes" ? "présence confirmée" : r.rsvp === "no" ? "déclinée" : "sans réponse", r.issues.length ? "à compléter" : "prête"].join(" ");
  const f = fold(q.trim());
  const shown = f ? rows.filter((r) => fold([r.name, r.whatsapp, r.whatsapp.replace(/\D/g, ""), r.code, r.table ? `table ${r.table}` : "sans table", status(r)].join(" ")).includes(f)) : rows;
  const cur = queue && queue.length ? rows.find((r) => r.id === queue[0]) : null;
  const running = !!queue && !!cur;
  const why = !enabled ? "Envoi indisponible : consultez le message en haut de la page." : running ? "" : !todo.length ? (rows.some((r) => r.issues.length) ? "Aucune invitation prête à envoyer : complétez les fiches signalées." : "Toutes les invitations prêtes ont déjà été envoyées.") : "";

  return (
    <div className="form sendwrap">
      {err && <div className="notice bad" role="alert">{err}</div>}
      {queue && (
        <section className="card form" ref={queueCard} style={{ scrollMarginTop: "calc(var(--head-h) + 12px)" }}>
          {cur ? (
            <>
              <h2>Invitation suivante · {rows.length - todo.length + 1}</h2>
              <p><b>{cur.name}</b> · {cur.whatsapp}</p>
              <div className="row">
                <button className="btn" disabled={!enabled || !!busy} onClick={async () => { if (await open(cur)) setQueue(queue.slice(1)); }}>{busy === cur.id ? "Enregistrement…" : "Ouvrir WhatsApp"}</button>
                <button className="btn ghost" disabled={!!busy} onClick={() => setQueue(queue.slice(1))}>Passer</button>
                <button className="btn ghost" disabled={!!busy} onClick={() => setQueue(null)}>Arrêter</button>
              </div>
              <p className="hint">Encore {queue.length} invitation(s). Revenez sur cette page après chaque message.</p>
            </>
          ) : <><h2>Terminé</h2><button className="btn ghost" onClick={() => setQueue(null)}>Fermer</button></>}
        </section>
      )}

      <div className="searchadd" role="search">
        <div className="searchadd-f">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une invitation…" aria-label="Rechercher une invitation : nom, numéro, code, table ou statut" enterKeyHint="search" />
          {q && <button type="button" className="searchadd-x" onClick={() => setQ("")} aria-label="Effacer la recherche">×</button>}
        </div>
      </div>
      {f && <p className="hint" role="status" style={{ margin: "-6px 0 0" }}>{shown.length ? `${shown.length} invitation(s) sur ${rows.length}` : ""}</p>}

      {!shown.length ? <div className="empty">Aucune invitation ne correspond à « {q.trim()} ». <button type="button" className="btn ghost sm" onClick={() => setQ("")}>Effacer la recherche</button></div> : (
        <div className="list">
          {shown.map((r) => {
            const done = r.sent || sent[r.id];
            return (
              <div key={r.id} className="li">
                <span style={{ minWidth: 0 }}>
                  <b>{r.name}</b>
                  <small>{r.whatsapp || "sans WhatsApp"} · code {r.code}{done ? ` · envoyée ${r.sent ? dateTime(r.sent) : "à l’instant"}` : ""}{r.rsvp === "yes" ? " · présence confirmée" : r.rsvp === "no" ? " · déclinée" : ""}</small>
                  {r.issues.length > 0 && <small style={{ display: "block", color: "var(--warn)" }}>{r.issues.join(" ")}</small>}
                </span>
                <span className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                  <ShareMenu r={r} available={linksOpen} />
                  {r.issues.length ? <Link className="btn ghost sm" href={`/events/${eventId}/guests/${r.id}`}>Compléter</Link>
                    : <button className={"btn sm" + (done ? " ghost" : "")} disabled={!enabled || !!busy} onClick={() => { if (!done || window.confirm(`L’invitation de ${r.name} a déjà été envoyée. La renvoyer ?`)) open(r); }}>{busy === r.id ? "…" : done ? "Renvoyer" : "Envoyer"}</button>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="sendbar">
        <button className="btn bigbtn" disabled={!enabled || !todo.length || running || !!busy} aria-busy={running || !!busy} onClick={start}>
          {running ? `Envoi en cours · ${queue!.length} restante(s)` : busy ? "Enregistrement…" : `Envoyer les invitations prêtes (${todo.length})`}
        </button>
        {why && <p className="hint">{why}</p>}
      </div>
    </div>
  );
}
