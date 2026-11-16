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
/**
 * Ouvre WhatsApp dans un nouvel onglet ; renvoie false seulement si le navigateur l'a vraiment bloqué.
 * (Avec l'option « noopener », window.open renvoie toujours null : on coupe le lien avec la page après l'ouverture.)
 */
function openWa(url: string): boolean {
  const w = window.open(url, "_blank");
  if (!w) return false;
  try { w.opener = null; } catch { /* onglet déjà isolé */ }
  return true;
}

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
    flash(openWa(waShareUrl(r)) ? "WhatsApp ouvert : choisissez le destinataire, puis envoyez." : "Fenêtre bloquée : autorisez les fenêtres pour ce site.");
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

/**
 * Liste d'envoi et envoi groupé : « Tout envoyer » ouvre WhatsApp invité après invité, depuis la barre du bas.
 * WhatsApp impose de valider chaque message ; en revenant sur la page, l'invité suivant est déjà prêt (un seul appui).
 * La file en cours survit à une actualisation de la page (sessionStorage, propre à cet onglet).
 */
export function SendList({ eventId, rows, enabled, linksOpen }: { eventId: string; rows: Row[]; enabled: boolean; linksOpen: boolean }) {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<string[] | null>(null);
  const [total, setTotal] = useState(0);
  const [opened, setOpened] = useState(0);
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const nextBtn = useRef<HTMLButtonElement>(null);
  const QKEY = `cer-send-queue:${eventId}`;
  const ready = rows.filter((r) => !r.issues.length);
  const todo = ready.filter((r) => !r.sent && !sent[r.id]);
  const alreadySent = ready.length - todo.length;
  const pool = resend ? ready : todo;

  // reprise de la file après une actualisation de la page
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(QKEY) || "null") as { ids: string[]; total: number; opened: number } | null;
      const ids = (s?.ids || []).filter((id) => ready.some((r) => r.id === id));
      if (ids.length) { setQueue(ids); setTotal(Math.max(s!.total || 0, ids.length)); setOpened(s!.opened || 0); }
    } catch { /* stockage indisponible */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (queue && queue.length) sessionStorage.setItem(QKEY, JSON.stringify({ ids: queue, total, opened }));
      else sessionStorage.removeItem(QKEY);
    } catch { /* stockage indisponible */ }
  }, [queue, total, opened, QKEY]);
  // retour depuis WhatsApp : le bouton de l'invité suivant reçoit le focus (Entrée suffit au clavier)
  useEffect(() => {
    if (!queue?.length) return;
    const back = () => { if (document.visibilityState === "visible") nextBtn.current?.focus({ preventScroll: true }); };
    document.addEventListener("visibilitychange", back); window.addEventListener("focus", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [queue]);

  async function open(r: Row) {
    if (busy) return false;
    setErr(""); setBusy(r.id);
    try {
      if (!openWa(waUrl(r))) { try { await navigator.clipboard.writeText(r.text); setErr("La fenêtre WhatsApp a été bloquée : le message a été copié, collez-le dans WhatsApp."); } catch { setErr("Autorisez les fenêtres pour ce site afin d’ouvrir WhatsApp."); } }
      const res = await markSent(eventId, [r.id]);
      if (!res.ok) { setErr(res.message || "Envoi non enregistré."); return false; }
      setSent((s) => ({ ...s, [r.id]: true }));
      return true;
    } finally { setBusy(null); }
  }
  /** Ouvre l'invité en tête de file, puis passe au suivant. */
  async function openHead(ids: string[]) {
    const r = rows.find((x) => x.id === ids[0]);
    if (!r) { setQueue(ids.slice(1)); return; }
    if (await open(r)) { setOpened((n) => n + 1); setQueue(ids.slice(1)); }
  }
  function start() {
    const ids = pool.map((r) => r.id);
    if (!ids.length) return;
    if (resend && alreadySent && !window.confirm(`${alreadySent} invitation(s) ont déjà été envoyées et seront renvoyées. Continuer ?`)) return;
    setErr(""); setTotal(ids.length); setOpened(0); setQueue(ids);
    void openHead(ids); // l'appui sur « Tout envoyer » ouvre déjà le premier invité
  }
  const stop = () => { setQueue(null); setTotal(0); setOpened(0); };

  const status = (r: Row) => [r.sent || sent[r.id] ? "envoyée" : "", r.rsvp === "yes" ? "présence confirmée" : r.rsvp === "no" ? "déclinée" : "sans réponse", r.issues.length ? "à compléter" : "prête"].join(" ");
  const f = fold(q.trim());
  const shown = f ? rows.filter((r) => fold([r.name, r.whatsapp, r.whatsapp.replace(/\D/g, ""), r.code, r.table ? `table ${r.table}` : "sans table", status(r)].join(" ")).includes(f)) : rows;
  const cur = queue && queue.length ? rows.find((r) => r.id === queue[0]) : null;
  const running = !!queue && !!cur;
  const finished = !!queue && !queue.length;
  const position = total - (queue?.length || 0) + 1;
  const why = !enabled ? "Envoi indisponible : consultez le message en haut de la page."
    : !pool.length ? (rows.some((r) => r.issues.length) && !ready.length ? "Aucune invitation prête à envoyer : complétez les fiches signalées." : "Toutes les invitations prêtes ont déjà été envoyées.") : "";

  return (
    <div className="form sendwrap">
      {err && <div className="notice bad" role="alert">{err}</div>}

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
              <div key={r.id} className="li" aria-current={cur?.id === r.id ? "step" : undefined}>
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

      <div className="sendbar" aria-live="polite">
        {running ? (
          <>
            <div className="bar" aria-hidden="true"><b style={{ width: `${Math.round(((position - 1) / Math.max(total, 1)) * 100)}%` }} /></div>
            <p className="hint">Invitation {position} sur {total} · <b>{cur!.name}</b> · {cur!.whatsapp}</p>
            <button ref={nextBtn} className="btn bigbtn" disabled={!enabled || !!busy} onClick={() => openHead(queue!)}>
              {busy ? "Enregistrement…" : `Ouvrir WhatsApp pour ${cur!.name}`}
            </button>
            <div className="row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => setQueue(queue!.slice(1))}>Passer cet invité</button>
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={stop}>Arrêter l’envoi</button>
            </div>
            <p className="hint">Dans WhatsApp, appuyez sur Envoyer, puis revenez ici : l’invité suivant est déjà prêt.</p>
          </>
        ) : finished ? (
          <>
            <p className="hint" role="status"><b>Envoi terminé</b> · {opened} invitation(s) ouverte(s) dans WhatsApp{total - opened > 0 ? `, ${total - opened} passée(s)` : ""}.</p>
            <button className="btn ghost" onClick={stop}>Fermer</button>
          </>
        ) : (
          <>
            {alreadySent > 0 && enabled && (
              <label className="check" style={{ justifySelf: "center" }}>
                <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} /> Renvoyer aussi les {alreadySent} invitation(s) déjà envoyée(s)
              </label>
            )}
            <button className="btn bigbtn" disabled={!enabled || !pool.length || !!busy} aria-busy={!!busy} onClick={start}>
              {busy ? "Enregistrement…" : resend ? `Tout envoyer (${pool.length})` : `Envoyer toutes les invitations prêtes (${pool.length})`}
            </button>
            {why ? <p className="hint">{why}</p> : <p className="hint">WhatsApp s’ouvre pour chaque invité, à la suite : validez chaque message, puis revenez ici.</p>}
          </>
        )}
      </div>
    </div>
  );
}
