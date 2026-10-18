"use client";
import { useActionState, useState } from "react";
import { parseGuests, KIND_LABEL } from "@ceremonia/core";
import { addGuest, addGuestList } from "@/app/(org)/events/[id]/guests/actions";
import { readGuestFile } from "@/lib/client/readGuestFile";
import type { ActionState } from "@/components/ConfirmAction";

/** Trois façons d'ajouter des invités : un par un, liste collée, fichier Excel ou CSV. */
export function GuestAdd({ eventId, prefix }: { eventId: string; prefix: string }) {
  const [mode, setMode] = useState<"one" | "paste" | "file">("one");
  const [list, setList] = useState("");
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [s1, run1, p1] = useActionState<ActionState, FormData>(addGuest, null);
  const [s2, run2, p2] = useActionState<ActionState, FormData>(async (prev: ActionState, fd: FormData) => { const r = await addGuestList(prev, fd); if (r?.ok) { setList(""); setFileName(""); } return r; }, null);
  const p = list.trim() ? parseGuests(list, prefix) : null;
  return (
    <section className="card form">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Ajouter des invités</h2>
        <div className="seg">
          <button type="button" aria-pressed={mode === "one"} onClick={() => setMode("one")}>Un invité</button>
          <button type="button" aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>Coller une liste</button>
          <button type="button" aria-pressed={mode === "file"} onClick={() => setMode("file")}>Importer un fichier</button>
        </div>
      </div>
      {mode === "one" ? (
        <form action={run1} className="form" key="one">
          <input type="hidden" name="event_id" value={eventId} />
          <div className="grid g3">
            <div className="fld"><label htmlFor="ga-n">Nom ou appellation</label><input id="ga-n" name="name" required maxLength={120} placeholder="Mr et Mme Kabila" /></div>
            <div className="fld"><label htmlFor="ga-k">Statut</label><select id="ga-k" name="kind" required defaultValue=""><option value="" disabled>Choisir</option><option value="mr">Monsieur</option><option value="mme">Madame</option><option value="couple">Couple (2 places)</option></select></div>
            <div className="fld"><label htmlFor="ga-w">WhatsApp</label><input id="ga-w" name="whatsapp" type="tel" inputMode="tel" placeholder={`${prefix} 81 234 5678`} /></div>
          </div>
          {s1?.message && <div className={"notice " + (s1.ok ? "ok" : "bad")} role="status">{s1.message}</div>}
          <div><button className="btn" disabled={p1}>{p1 ? "Ajout…" : "Ajouter"}</button></div>
        </form>
      ) : (
        <form action={run2} className="form" key="list">
          <input type="hidden" name="event_id" value={eventId} />
          {mode === "file" && (
            <div className="row">
              <label className="btn ghost" style={{ position: "relative" }}>{fileName ? "Choisir un autre fichier" : "Choisir un fichier Excel (.xlsx) ou CSV"}
                <input type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                  onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErr(""); try { setList(await readGuestFile(f)); setFileName(f.name); } catch (x) { setErr((x as Error).message); } }} />
              </label>
              {fileName && <span className="hint">{fileName}</span>}
            </div>
          )}
          {err && <div className="notice bad">{err}</div>}
          {(mode === "paste" || list) && <div className="fld"><label htmlFor="ga-l">{mode === "paste" ? "Une invitation par ligne : Nom ; Statut ; WhatsApp" : "Contenu lu dans le fichier (modifiable)"}</label><textarea id="ga-l" name="list" value={list} onChange={(e) => setList(e.target.value)} style={{ minHeight: 160 }} placeholder={"Mr Luc Mbuyi ; Monsieur ; 081 000 0001\nCouple Bola ; Couple ; +243 81 000 0002"} /></div>}
          {p && (
            <div className={"notice " + (p.rows.length ? "ok" : "bad")}>
              <b>{p.rows.length} invitation(s) reconnue(s)</b> · {p.rows.reduce((a, r) => a + (r.kind === "couple" ? 2 : 1), 0)} personne(s)
              {p.rows.slice(0, 5).map((r, i) => <div key={i} className="hint">{r.name} · {r.kind ? KIND_LABEL[r.kind] : "statut à préciser"}{r.whatsapp ? " · " + r.whatsapp : ""}</div>)}
              {p.issues.length > 0 && <div className="hint" style={{ color: "var(--warn)" }}>{p.issues.slice(0, 3).join(" ")}</div>}
            </div>
          )}
          {s2?.message && <div className={"notice " + (s2.ok ? "ok" : "bad")} role="status">{s2.message}</div>}
          <div><button className="btn" disabled={p2 || !p?.rows.length}>{p2 ? "Enregistrement…" : `Ajouter ${p?.rows.length || ""} invitation(s)`}</button></div>
        </form>
      )}
    </section>
  );
}
