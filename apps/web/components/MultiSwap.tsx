"use client";
import { useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import type { ActionState } from "@/components/ConfirmAction";

type G = { id: string; name: string; hint: string; seats: number; table: number };
type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

const pl = (n: number, one: string, many = one + "s") => `${n} ${n > 1 ? many : one}`;
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Permutation multiple : groupe A (invités à déplacer) et groupe B (invités avec qui permuter), chacun avec sa recherche.
 * Le n-ième invité coché en A échange sa place avec le n-ième coché en B. Un invité ne peut être que dans un groupe.
 * Aperçu des échanges et contrôle de capacité avant confirmation ; le serveur et la base revérifient tout à l'enregistrement.
 */
export function MultiSwap({ eventId, guests, cap, tables, action }: { eventId: string; guests: G[]; cap: number; tables: number; action: Action }) {
  const safe: Action = async (p, fd) => {
    try { return await action(p, fd); }
    catch (e) {
      if (String((e as { digest?: string })?.digest || "").startsWith("NEXT_")) throw e; // redirection après succès
      return { ok: false, message: "Connexion au serveur impossible : aucune place n’a été modifiée. Vérifiez la connexion et réessayez." };
    }
  };
  const [state, run, pending] = useActionState(safe, null);
  const [selA, setSelA] = useState<string[]>([]);
  const [selB, setSelB] = useState<string[]>([]);
  const sent = useRef(false);
  if (!pending) sent.current = false;

  const byId = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const A = selA.map((id) => byId.get(id)).filter((g): g is G => !!g);
  const B = selB.map((id) => byId.get(id)).filter((g): g is G => !!g);
  const pairs = A.length === B.length ? A.map((a, i) => [a, B[i]] as const) : [];
  const samePairs = pairs.filter(([a, b]) => a.table === b.table);

  // Occupation des tables après tous les échanges (effet net), pour ne jamais dépasser la capacité.
  const over = (() => {
    if (!pairs.length) return [] as { t: number; used: number }[];
    const dest = new Map<string, number>();
    for (const [a, b] of pairs) { dest.set(a.id, b.table); dest.set(b.id, a.table); }
    const use = new Map<number, number>();
    for (const g of guests) { const t = dest.get(g.id) ?? g.table; use.set(t, (use.get(t) || 0) + g.seats); }
    const touched = new Set(pairs.flatMap(([a, b]) => [a.table, b.table]));
    return [...touched].filter((t) => (use.get(t) || 0) > cap).sort((x, y) => x - y).map((t) => ({ t, used: use.get(t) || 0 }));
  })();
  const ghost = pairs.some(([a, b]) => a.table > tables || b.table > tables);

  const mismatch = A.length !== B.length;
  const ready = A.length > 0 && !mismatch && !samePairs.length && !over.length && !ghost;

  const once = (e: FormEvent) => {
    if (sent.current || pending || !ready) { e.preventDefault(); return; }
    sent.current = true;
  };

  return (
    <form action={run} onSubmit={once} className="form multiswap">
      <input type="hidden" name="event_id" value={eventId} />
      {pairs.map(([a, b]) => (
        <span key={a.id} hidden>
          <input type="hidden" name="a" value={a.id} /><input type="hidden" name="at" value={a.table} />
          <input type="hidden" name="b" value={b.id} /><input type="hidden" name="bt" value={b.table} />
        </span>
      ))}

      <p className="hint" style={{ margin: 0 }}>
        Cochez les invités à déplacer dans le groupe A, puis autant d’invités dans le groupe B. Les échanges se font dans l’ordre de sélection : le 1<sup>er</sup> invité coché en A échange avec le 1<sup>er</sup> coché en B, et ainsi de suite.
      </p>

      <div className="swap-groups">
        <Group
          letter="A" title="Invités à déplacer" guests={guests} sel={selA} other={selB} otherLetter="B"
          setSel={setSelA} disabled={pending}
        />
        <Group
          letter="B" title="Invités avec lesquels permuter" guests={guests} sel={selB} other={selA} otherLetter="A"
          setSel={setSelB} disabled={pending}
        />
      </div>

      <section className="card form" aria-live="polite">
        <h2 style={{ margin: 0 }}>Aperçu des échanges</h2>
        {!A.length && !B.length ? (
          <p className="hint" style={{ margin: 0 }}>Aucun invité sélectionné pour l’instant.</p>
        ) : mismatch ? (
          <div className="notice bad" role="alert" style={{ margin: 0 }}>
            Les deux groupes doivent contenir le même nombre d’invités : {pl(A.length, "invité")} dans le groupe A, {pl(B.length, "invité")} dans le groupe B.
            {" "}{A.length > B.length ? `Ajoutez ${pl(A.length - B.length, "invité")} au groupe B ou retirez-en du groupe A.` : `Ajoutez ${pl(B.length - A.length, "invité")} au groupe A ou retirez-en du groupe B.`}
          </div>
        ) : (
          <>
            <ul className="swap-recap">
              {pairs.map(([a, b], i) => (
                <li key={a.id} className={a.table === b.table ? "bad" : ""}>
                  <span className="badge">{i + 1}</span>
                  <span><b>{a.name}</b> <small className="hint">table {a.table} → {b.table}</small></span>
                  <span aria-label="échange avec">↔</span>
                  <span><b>{b.name}</b> <small className="hint">table {b.table} → {a.table}</small></span>
                </li>
              ))}
            </ul>
            {samePairs.length > 0 && (
              <div className="notice bad" role="alert" style={{ margin: 0 }}>
                Déjà à la même table, rien à échanger : {samePairs.map(([a, b]) => `${a.name} ↔ ${b.name} (table ${a.table})`).join(", ")}. Changez l’un des deux invités de chaque échange concerné.
              </div>
            )}
            {over.length > 0 && (
              <div className="notice bad" role="alert" style={{ margin: 0 }}>
                Capacité dépassée après permutation : {over.map((o) => `table ${o.t} (${o.used} personnes pour ${cap} places)`).join(", ")}. Un couple compte 2 places : échangez-le avec un autre couple ou modifiez la sélection.
              </div>
            )}
            {ghost && <div className="notice bad" role="alert" style={{ margin: 0 }}>Un invité est assis à une table qui n’existe plus : déplacez-le d’abord depuis la page des tables.</div>}
          </>
        )}
      </section>

      {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="alert">{state.message}</div>}
      <div className="sendbar">
        <button type="submit" className="btn bigbtn" disabled={pending || !ready} aria-busy={pending}>
          {pending ? "Enregistrement…" : ready ? `Confirmer la permutation (${pl(pairs.length, "échange")})` : "Confirmer la permutation"}
        </button>
      </div>
    </form>
  );
}

function Group({ letter, title, guests, sel, other, otherLetter, setSel, disabled }: {
  letter: string; title: string; guests: G[]; sel: string[]; other: string[]; otherLetter: string;
  setSel: (f: (s: string[]) => string[]) => void; disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const f = fold(q.trim());
  const shown = f ? guests.filter((g) => fold(g.name).includes(f)) : guests;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : other.includes(id) ? s : [...s, id]));

  return (
    <section className="card form swap-group" aria-label={`Groupe ${letter} : ${title}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Groupe {letter} · {title}</h2>
        <span className={"badge" + (sel.length ? " gold" : "")} aria-live="polite">{pl(sel.length, "sélectionné", "sélectionnés")}</span>
      </div>
      <div className="searchadd-f" role="search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom ou prénom…" aria-label={`Rechercher un invité dans le groupe ${letter}`} enterKeyHint="search" />
        {q && <button type="button" className="searchadd-x" onClick={() => setQ("")} aria-label="Effacer la recherche">×</button>}
      </div>
      {sel.length > 0 && (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost sm" onClick={() => setSel(() => [])} disabled={disabled}>Tout désélectionner</button>
        </div>
      )}
      {!shown.length ? <p className="hint" style={{ margin: 0 }}>Aucun invité ne correspond à « {q.trim()} ».</p> : (
        <div className="list swap-list" role="group" aria-label={`Invités du groupe ${letter}`}>
          {shown.map((g) => {
            const i = sel.indexOf(g.id);
            const on = i >= 0;
            const blocked = !on && other.includes(g.id);
            return (
              <div key={g.id} className={"li mp-row" + (on ? " sel" : "") + (blocked ? " off" : "")}>
                <label className="mp-pick">
                  <input type="checkbox" checked={on} disabled={disabled || blocked} onChange={() => toggle(g.id)} aria-describedby={blocked ? `sw-${letter}-${g.id}` : undefined} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <b>{g.name}</b>
                    <small style={{ display: "block" }}>Table {g.table} · {g.hint}</small>
                    {blocked && <small id={`sw-${letter}-${g.id}`} style={{ display: "block" }}>Déjà sélectionné(e) dans le groupe {otherLetter}</small>}
                  </span>
                  {on && <span className="badge gold" aria-label={`échange n° ${i + 1}`}>{i + 1}</span>}
                </label>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
