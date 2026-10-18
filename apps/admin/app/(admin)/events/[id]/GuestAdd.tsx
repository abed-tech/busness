"use client";
import { useActionState, useState } from "react";
import { parseGuests } from "@ceremonia/core";
import { addGuests } from "../actions";
import { readGuestFile } from "@/lib/client/readGuestFile";
import type { ActionState } from "@/components/ConfirmAction";

/** Les trois façons d'ajouter des invités : saisie, liste collée, fichier (mêmes formats que l'espace organisateur). */
export function GuestAdd({ eventId }: { eventId: string }) {
  const [mode, setMode] = useState<"one" | "list">("one");
  const [list, setList] = useState("");
  const [err, setErr] = useState("");
  const [state, run, pending] = useActionState<ActionState, FormData>(addGuests, null);
  const p = list.trim() ? parseGuests(list, "+243") : null;
  return (
    <section className="card form">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Ajouter des invités</h2>
        <div className="seg"><button type="button" aria-pressed={mode === "one"} onClick={() => setMode("one")}>Un invité</button><button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")}>Liste ou fichier</button></div>
      </div>
      <form action={run} className="form" key={mode}>
        <input type="hidden" name="event_id" value={eventId} />
        {mode === "one" ? (
          <div className="grid g3">
            <div className="fld"><label htmlFor="ga-n">Nom ou appellation</label><input id="ga-n" name="name" required maxLength={120} /></div>
            <div className="fld"><label htmlFor="ga-k">Statut</label><select id="ga-k" name="kind" required defaultValue=""><option value="" disabled>Choisir</option><option value="mr">Monsieur</option><option value="mme">Madame</option><option value="couple">Couple (2 places)</option></select></div>
            <div className="fld"><label htmlFor="ga-w">WhatsApp</label><input id="ga-w" name="whatsapp" type="tel" placeholder="+243 81 234 5678" /></div>
          </div>
        ) : (
          <>
            <div className="fld"><label htmlFor="ga-l">Liste (Nom ; Statut ; WhatsApp)</label><textarea id="ga-l" name="list" value={list} onChange={(e) => setList(e.target.value)} style={{ minHeight: 140 }} /></div>
            <div className="row">
              <label className="btn ghost sm" style={{ position: "relative" }}>Importer un fichier Excel ou CSV
                <input type="file" accept=".xlsx,.csv,.txt,.tsv" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErr(""); try { setList(await readGuestFile(f)); } catch (x) { setErr((x as Error).message); } }} />
              </label>
              {err && <span className="badge bad">{err}</span>}
              {p && <span className="hint">{p.rows.length} invitation(s) reconnue(s){p.issues.length ? ` · ${p.issues.length} remarque(s)` : ""}</span>}
            </div>
          </>
        )}
        {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="status">{state.message}</div>}
        <div><button className="btn" type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Ajouter"}</button></div>
      </form>
    </section>
  );
}
