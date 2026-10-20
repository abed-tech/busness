"use client";
import { useState, useTransition } from "react";
import { previewSeating, confirmSeating, moveGuest, type SeatingPreview } from "@/app/(org)/events/[id]/tables/actions";
import type { ActionState } from "@/components/ConfirmAction";

type G = { id: string; name: string; kind: string | null; manual?: boolean };
type T = { n: number; used: number; free: number; ghost: boolean; guests: G[] };
const seatsOf = (g: { kind: string | null }) => (g.kind === "couple" ? 2 : 1);

/** « Placer les invités » : placement automatique (aperçu puis confirmation) ou manuel (invité → table), sur les données réelles. */
export function SeatingManager({ eventId, cap, write, tables, unplaced }: { eventId: string; cap: number; write: boolean; tables: T[]; unplaced: G[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual" | null>(null);
  const [keep, setKeep] = useState(true);
  const [preview, setPreview] = useState<SeatingPreview | null>(null);
  const [msg, setMsg] = useState<ActionState>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const manual = write && mode === "manual";
  const all = [...unplaced.map((g) => ({ ...g, t: 0 })), ...tables.flatMap((t) => t.guests.map((g) => ({ ...g, t: t.n })))];
  const chosen = all.find((g) => g.id === sel) || null;

  const choose = (m: "auto" | "manual") => { setMode(m); setPreview(null); setMsg(null); setSel(null); };
  const compute = () => start(async () => { setMsg(null); const r = await previewSeating(eventId, keep); if (r.ok) setPreview(r); else { setPreview(null); setMsg(r); } });
  const confirm = () => start(async () => {
    if (!preview?.plan) return;
    const r = await confirmSeating(eventId, keep, preview.plan);
    setMsg(r);
    if (r?.ok) setPreview(null);
  });
  const move = (table: number) => start(async () => {
    if (!chosen) return;
    const fd = new FormData();
    fd.set("event_id", eventId); fd.set("guest_id", chosen.id); fd.set("table", String(table));
    const r = await moveGuest(null, fd);
    setMsg(r);
    if (r?.ok) setSel(null);
  });

  const Guest = ({ g, t }: { g: G; t: number }) => {
    const label = <>{g.name}{g.kind === "couple" ? <span className="hint"> · couple, 2 places</span> : !g.kind ? <span className="hint"> · statut à préciser</span> : null}{g.manual && <span className="hint"> · placé à la main</span>}</>;
    if (!manual) return <span className="seat">{label}</span>;
    return (
      <button type="button" className="seat pick" aria-pressed={sel === g.id} disabled={pending} onClick={() => setSel(sel === g.id ? null : g.id)}
        aria-label={`${sel === g.id ? "Désélectionner" : "Sélectionner"} ${g.name}${t ? `, table ${t}` : ", sans table"}`}>{label}</button>
    );
  };

  return (
    <>
      {write && (
        <section className="card form" style={{ marginBottom: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Placement des invités</h2>
            <button type="button" className="btn" aria-expanded={open} onClick={() => { setOpen(!open); setMode(null); setPreview(null); setSel(null); setMsg(null); }}>Placer les invités</button>
          </div>
          {open && (
            <div className="addmodes" role="group" aria-label="Mode de placement">
              <button type="button" className="addmode" aria-pressed={mode === "auto"} onClick={() => choose("auto")}>
                <span><b>Placement automatique</b><small>Couples ensemble, personnes seules regroupées, capacité respectée. Aperçu avant d’enregistrer.</small></span>
              </button>
              <button type="button" className="addmode" aria-pressed={mode === "manual"} onClick={() => choose("manual")}>
                <span><b>Placement manuel</b><small>Touchez un invité ou un couple, puis la table où l’asseoir.</small></span>
              </button>
            </div>
          )}

          {mode === "auto" && (
            <div className="form">
              <label className="check"><input type="checkbox" checked={keep} onChange={(e) => { setKeep(e.target.checked); setPreview(null); }} /> Garder les invités déjà placés à leur table</label>
              {!preview && <div><button type="button" className="btn" disabled={pending} onClick={compute}>{pending ? "Calcul…" : "Calculer la répartition"}</button></div>}
              {preview?.tables && (
                <div className="form" aria-live="polite">
                  <div className="notice">
                    <b>Répartition proposée (rien n’est encore enregistré)</b>
                    <div className="hint">{preview.placed} invitation(s) à placer{preview.kept ? ` · ${preview.kept} placement(s) conservé(s)` : ""} · {preview.mixedTables ? `${preview.mixedTables} table(s) mêlant couples et personnes seules, faute de place` : "couples et personnes seules à des tables séparées"}</div>
                    {!!preview.unknownKind && <div className="hint" style={{ color: "var(--warn)" }}>{preview.unknownKind} invitation(s) au statut à préciser, comptée(s) pour une place.</div>}
                  </div>
                  {!!preview.unplaced?.length && (
                    <div className="notice bad" role="alert">
                      {preview.problems?.map((p, i) => <div key={i}>{p}</div>)}
                      <div className="hint" style={{ marginTop: 6 }}>Sans place : {preview.unplaced.map((g) => g.name + (g.couple ? " (couple)" : "")).join(", ")}</div>
                    </div>
                  )}
                  <div className="tables-grid">
                    {preview.tables.filter((t) => t.guests.length).map((t) => (
                      <section key={t.n} className={"tcard" + (t.used === preview.cap ? " full" : "")}>
                        <h3><span>Table {t.n}</span><span className="hint">{t.used}/{preview.cap}</span></h3>
                        {t.mixed && <span className="badge warn" style={{ justifySelf: "start" }}>Mixte</span>}
                        {t.guests.map((g) => <span key={g.id} className={g.kept ? "hint" : ""}>{g.name}{g.couple ? " · couple" : ""}{g.kept ? " · déjà placé" : ""}</span>)}
                      </section>
                    ))}
                  </div>
                  <div className="row">
                    <button type="button" className="btn" disabled={pending} onClick={confirm}>{pending ? "Enregistrement…" : "Confirmer et enregistrer"}</button>
                    <button type="button" className="btn ghost" disabled={pending} onClick={() => setPreview(null)}>Annuler</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {manual && (
            <p className="notice" role="status">
              {chosen ? <>Sélection : <b>{chosen.name}</b> ({seatsOf(chosen)} place{seatsOf(chosen) > 1 ? "s" : ""}). Choisissez la table de destination ci-dessous.{" "}
                {chosen.t > 0 && <button type="button" className="btn ghost sm" disabled={pending} onClick={() => move(0)}>Retirer de la table {chosen.t}</button>}{" "}
                <button type="button" className="btn ghost sm" onClick={() => setSel(null)}>Annuler</button></>
                : "Touchez un invité ou un couple pour le sélectionner. Un couple occupe toujours 2 places à la même table."}
            </p>
          )}
          {msg?.message && <div className={"notice " + (msg.ok ? "ok" : "bad")} role="status">{msg.message}</div>}
        </section>
      )}

      {unplaced.length > 0 && (
        <section className="card form" style={{ marginBottom: 16 }}>
          <h2>Sans table ({unplaced.length})</h2>
          <div className="seats">{unplaced.map((g) => <Guest key={g.id} g={g} t={0} />)}</div>
        </section>
      )}
      <div className="tables-grid">
        {tables.map((t) => {
          const fits = !!chosen && chosen.t !== t.n && !t.ghost && t.free >= seatsOf(chosen);
          return (
            <section key={t.n} className={"tcard" + (t.used > cap || t.ghost ? " over" : t.free === 0 ? " full" : "")}>
              <h3><span>Table {t.n}</span><span className="hint">{t.used}/{cap} · {Math.max(0, t.free)} libre{t.free > 1 ? "s" : ""}</span></h3>
              {t.ghost && <p className="hint" style={{ color: "var(--bad)" }}>Cette table n’existe plus : déplacez ses invités.</p>}
              {!t.guests.length ? <p className="hint">Table vide</p> : <div className="seats">{t.guests.map((g) => <Guest key={g.id} g={g} t={t.n} />)}</div>}
              {manual && chosen && chosen.t !== t.n && (
                <button type="button" className="btn sm" disabled={!fits || pending} onClick={() => move(t.n)}>
                  {fits ? `Placer ${chosen.name} ici` : t.ghost ? "Table supprimée" : "Pas assez de places"}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
