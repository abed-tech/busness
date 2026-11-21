"use client";
import { useState } from "react";
import Link from "next/link";

export type PickItem = { id: string; name: string; table: number; whatsapp: string; code: string; hint: string };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Barre de recherche fixe + liste d'invités filtrée en direct, groupée par table.
 * On coche un ou plusieurs invités d'une même table (« Toute la table » coche tout le monde) puis on continue.
 * `param` = « a » ou « b » ; `keep` = valeur de « a » déjà choisie à l'étape 2.
 */
export function PermuterPicker({ items, placeholder, base, param, keep, label }: { items: PickItem[]; placeholder: string; base: string; param: "a" | "b"; keep?: string; label: string }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const f = fold(q.trim());
  const tableQ = f.replace(/^table\s*/, "");
  const shown = f ? items.filter((g) => fold(`${g.name} ${g.whatsapp} ${g.whatsapp.replace(/\D/g, "")} ${g.code} table ${g.table}`).includes(f) || String(g.table) === tableQ) : items;
  const by = new Map<number, PickItem[]>();
  for (const g of shown) by.set(g.table, [...(by.get(g.table) || []), g]);
  const lock = sel.length ? items.find((g) => g.id === sel[0])!.table : 0; // table des invités déjà cochés
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleTable = (t: number) => setSel((s) => {
    const all = items.filter((g) => g.table === t).map((g) => g.id);
    return all.every((i) => s.includes(i)) ? [] : all;
  });
  const next = `${base}/permuter?${new URLSearchParams({ ...(keep ? { a: keep } : {}), [param]: sel.join(".") }).toString()}`;

  return (
    <>
      <div className="searchadd" role="search">
        <div className="searchadd-f">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Rechercher un invité : nom, numéro, code ou table" enterKeyHint="search" autoComplete="off" />
          {q && <button type="button" className="searchadd-x" onClick={() => setQ("")} aria-label="Effacer la recherche">×</button>}
        </div>
      </div>
      {f && <p className="hint" role="status" style={{ margin: "-6px 0 10px" }}>{shown.length ? `${shown.length} invité(s) sur ${items.length}` : ""}</p>}
      <p className="hint" style={{ marginBottom: 10 }}>Cochez un ou plusieurs invités <b>d’une même table</b>.</p>
      {!shown.length ? (
        <div className="empty">Aucun invité assis ne correspond à « {q.trim()} ». <button type="button" className="btn ghost sm" onClick={() => setQ("")}>Effacer la recherche</button></div>
      ) : (
        <div className="grid" style={{ gap: 14, paddingBottom: 90 }}>
          {[...by.entries()].sort((x, y) => x[0] - y[0]).map(([t, gs]) => {
            const off = !!lock && lock !== t;
            return (
              <section key={t} style={off ? { opacity: 0.5 } : undefined}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h3 style={{ fontSize: "1.1rem", margin: 0 }}>Table {t}</h3>
                  <button type="button" className="btn ghost sm" disabled={off} onClick={() => toggleTable(t)}>
                    {lock === t && items.filter((g) => g.table === t).every((g) => sel.includes(g.id)) ? "Tout décocher" : "Toute la table"}
                  </button>
                </div>
                <div className="list">{gs.map((g) => (
                  <label key={g.id} className="li pickrow" style={{ cursor: off ? "not-allowed" : "pointer" }}>
                    <input type="checkbox" checked={sel.includes(g.id)} disabled={off} onChange={() => toggle(g.id)} style={{ width: 20, height: 20, flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0 }}><b>{g.name}</b><small className="hint" style={{ display: "block" }}>Table {g.table} · {g.hint}</small></span>
                  </label>
                ))}</div>
              </section>
            );
          })}
        </div>
      )}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 6, padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))", background: "var(--bg)", borderTop: "1px solid var(--line)", display: "flex", gap: 10, justifyContent: "center", alignItems: "center" }}>
        {sel.length ? (
          <>
            <button type="button" className="btn ghost" onClick={() => setSel([])}>Vider</button>
            <Link className="btn pay-main" href={next}>{label} ({sel.length} invité{sel.length > 1 ? "s" : ""}, table {lock})</Link>
          </>
        ) : <span className="hint">Aucun invité coché</span>}
      </div>
    </>
  );
}
