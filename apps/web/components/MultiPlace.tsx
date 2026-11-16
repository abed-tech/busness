"use client";
import Link from "next/link";
import { useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import type { ActionState } from "@/components/ConfirmAction";

type G = { id: string; name: string; hint: string; seats: number };
type T = { n: number; used: number; cap: number; free: number; names: string[] };
type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

const pl = (n: number, one: string, many = one + "s") => `${n} ${n > 1 ? many : one}`;

/**
 * Placement manuel groupé : cocher plusieurs invités sans table, choisir la table, puis « Placer les invités ».
 * La sélection est limitée aux places restantes de la table choisie (un couple compte 2 places) ;
 * le serveur et la base revérifient tout au moment de l'enregistrement.
 */
export function MultiPlace({ eventId, guests, tables, action, base }: { eventId: string; guests: G[]; tables: T[]; action: Action; base: string }) {
  const safe: Action = async (p, fd) => {
    try { return await action(p, fd); }
    catch (e) {
      if (String((e as { digest?: string })?.digest || "").startsWith("NEXT_")) throw e; // redirection après succès
      return { ok: false, message: "Connexion au serveur impossible : rien n’a été enregistré. Vérifiez la connexion et réessayez." };
    }
  };
  const [state, run, pending] = useActionState(safe, null);
  const [table, setTable] = useState<number>(tables[0]?.n ?? 0);
  const [sel, setSel] = useState<string[]>([]);
  const sent = useRef(false);
  if (!pending) sent.current = false;

  const T = tables.find((t) => t.n === table) || null;
  const byId = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const chosen = sel.map((id) => byId.get(id)).filter((g): g is G => !!g);
  const need = chosen.reduce((s, g) => s + g.seats, 0);
  const left = T ? T.free - need : 0; // places restantes après la sélection
  const over = !!T && need > T.free;

  const fits = (g: G) => !!T && g.seats <= left;
  function toggle(g: G) {
    setSel((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : fits(g) ? [...s, g.id] : s));
  }
  /** Coche les invités dans l'ordre de la liste, tant qu'il reste de la place. */
  function fillUp() {
    if (!T) return;
    let room = T.free - need;
    const add: string[] = [];
    for (const g of guests) if (!sel.includes(g.id) && g.seats <= room) { add.push(g.id); room -= g.seats; }
    setSel((s) => [...s, ...add]);
  }
  const once = (e: FormEvent) => {
    if (sent.current || pending || !T || !chosen.length || over) { e.preventDefault(); return; }
    sent.current = true;
  };

  return (
    <form action={run} onSubmit={once} className="form multiplace">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="table" value={table || ""} />
      {chosen.map((g) => <input key={g.id} type="hidden" name="guest_ids" value={g.id} />)}

      <section className="card form">
        <div className="fld">
          <label htmlFor="mp-table">Table de destination</label>
          <select id="mp-table" value={table || ""} onChange={(e) => setTable(Number(e.target.value))} disabled={pending}>
            {tables.map((t) => <option key={t.n} value={t.n}>Table {t.n} · {pl(t.free, "place restante", "places restantes")}</option>)}
          </select>
        </div>
        {T && (
          <>
            <div className="mp-stats" role="status" aria-live="polite">
              <span><b>{T.cap}</b><small>capacité</small></span>
              <span><b>{T.used + need}</b><small>{need ? `occupée${T.used + need > 1 ? "s" : ""} après placement` : `occupée${T.used > 1 ? "s" : ""}`}</small></span>
              <span className={left <= 0 ? "full" : ""}><b>{Math.max(0, left)}</b><small>restante{left > 1 ? "s" : ""}</small></span>
            </div>
            <div className="bar" aria-hidden="true"><b style={{ width: `${Math.min(100, Math.round(((T.used + need) / Math.max(T.cap, 1)) * 100))}%` }} /></div>
            {T.names.length > 0 && <p className="hint" style={{ margin: 0 }}>Déjà à cette table : {T.names.join(", ")}</p>}
          </>
        )}
      </section>

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="hint" style={{ margin: 0 }} aria-live="polite">
          <b>{pl(chosen.length, "invité sélectionné", "invités sélectionnés")}</b>{need !== chosen.length ? ` · ${pl(need, "place")}` : ""}
        </p>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className="btn ghost sm" onClick={fillUp} disabled={pending || !T || left <= 0 || chosen.length === guests.length}>Sélectionner jusqu’à remplir la table</button>
          {chosen.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setSel([])} disabled={pending}>Tout désélectionner</button>}
        </span>
      </div>
      {over && <div className="notice bad" role="alert">La table {table} n’a que {pl(T!.free, "place restante", "places restantes")} : retirez {pl(need - T!.free, "place")} de la sélection ou choisissez une autre table.</div>}

      <div className="list" role="group" aria-label="Invités non placés">
        {guests.map((g) => {
          const on = sel.includes(g.id);
          const blocked = !on && !fits(g);
          return (
            <div key={g.id} className={"li mp-row" + (on ? " sel" : "") + (blocked ? " off" : "")}>
              <label className="mp-pick">
                <input type="checkbox" checked={on} disabled={pending || blocked} onChange={() => toggle(g)} aria-describedby={blocked ? `mp-why-${g.id}` : undefined} />
                <span style={{ minWidth: 0 }}>
                  <b>{g.name}</b>
                  <small style={{ display: "block" }}>{g.hint}</small>
                  {blocked && T && <small id={`mp-why-${g.id}`} style={{ display: "block" }}>{left <= 0 ? "Table complète" : `Pas assez de place (${g.seats} nécessaires)`}</small>}
                </span>
              </label>
              <Link className="btn ghost sm" href={`${base}/manuel/${g.id}`} aria-label={`Choisir une table pour ${g.name} seul(e)`}>Seul ›</Link>
            </div>
          );
        })}
      </div>

      {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="alert">{state.message}</div>}
      <div className="sendbar">
        <button type="submit" className="btn bigbtn" disabled={pending || !T || !chosen.length || over} aria-busy={pending}>
          {pending ? "Placement…" : chosen.length ? `Placer les invités (${chosen.length}) à la table ${table}` : "Placer les invités"}
        </button>
        {!chosen.length && <p className="hint">Cochez les invités à asseoir à la table {table}.</p>}
      </div>
    </form>
  );
}
