"use client";
import { useActionState, useState } from "react";
import { splitRows } from "@ceremonia/core";
import { addItems } from "@/app/(org)/events/[id]/drinks/actions";
import { readGuestFile } from "@/lib/client/readGuestFile";
import type { ActionState } from "@/components/ConfirmAction";
import type { AddMode } from "./SearchAdd";

const MAX = 60; // limite appliquée par addItems
const HEAD = /^(nom|noms|name|libelle|boissons?|plats?|menu)$/;

/** Noms lus dans une liste collée ou un fichier : première colonne, une ligne par élément, sans doublon. */
function itemNames(text: string) {
  const rows = splitRows(text).map((r) => (r[0] || "").trim().slice(0, 80)).filter(Boolean);
  if (rows.length && HEAD.test(rows[0].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""))) rows.shift();
  const seen = new Set<string>();
  return rows.filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
}

export function CatalogAdd({ eventId, kind, mode }: { eventId: string; kind: "drink" | "dish"; mode: AddMode }) {
  const L = kind === "drink"
    ? { one: "Nom de la boisson", ex: "Coca-Cola", list: "Coca-Cola\nFanta\nPrimus", many: "boisson(s)" }
    : { one: "Nom du plat", ex: "Poulet braisé", list: "Poulet braisé\nPoisson\nRiz", many: "plat(s)" };
  const [list, setList] = useState("");
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [s, run, pending] = useActionState<ActionState, FormData>(async (p: ActionState, fd: FormData) => { const r = await addItems(p, fd); if (r?.ok) { setList(""); setFileName(""); } return r; }, null);
  const names = mode === "one" ? [] : itemNames(list);
  return (
    <section className="card form">
      <h2 style={{ margin: 0 }}>{mode === "one" ? "Ajouter manuellement" : mode === "file" ? "Importer une liste" : "Coller une liste"}</h2>
      <form action={run} className="form">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="kind" value={kind} />
        {mode === "one" ? (
          <div className="fld"><label htmlFor="ca-n">{L.one}</label><input id="ca-n" name="names" required maxLength={80} placeholder={L.ex} autoComplete="off" /></div>
        ) : (
          <>
            <input type="hidden" name="names" value={names.slice(0, MAX).join("\n")} />
            {mode === "file" && (
              <div className="row">
                <label className="btn ghost" style={{ position: "relative" }}>{fileName ? "Choisir un autre fichier" : "Choisir un fichier Excel (.xlsx) ou CSV"}
                  <input type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                    onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErr(""); try { setList(await readGuestFile(f)); setFileName(f.name); } catch (x) { setErr((x as Error).message); } }} />
                </label>
                {fileName && <span className="hint">{fileName}</span>}
              </div>
            )}
            {mode === "file" && <p className="hint">Les noms sont lus dans la première colonne ; une ligne d’en-tête « Nom » est ignorée.</p>}
            {err && <div className="notice bad">{err}</div>}
            {(mode === "paste" || list) && <div className="fld"><label htmlFor="ca-l">{mode === "paste" ? "Un nom par ligne" : "Contenu lu dans le fichier (modifiable)"}</label><textarea id="ca-l" value={list} onChange={(e) => setList(e.target.value)} style={{ minHeight: 160 }} placeholder={L.list} /></div>}
            {list.trim() && (
              <div className={"notice " + (names.length ? "ok" : "bad")}>
                <b>{names.length} {L.many} reconnu(s)</b>
                {names.slice(0, 5).map((n) => <div key={n} className="hint">{n}</div>)}
                {names.length > MAX && <div className="hint" style={{ color: "var(--warn)" }}>{MAX} au maximum par envoi : seuls les {MAX} premiers seront ajoutés.</div>}
              </div>
            )}
          </>
        )}
        {s?.message && <div className={"notice " + (s.ok ? "ok" : "bad")} role="status">{s.message}</div>}
        <div><button className="btn" disabled={pending || (mode !== "one" && !names.length)}>{pending ? "Ajout…" : mode === "one" ? "Ajouter" : `Ajouter ${Math.min(names.length, MAX) || ""} ${L.many}`}</button></div>
      </form>
    </section>
  );
}
