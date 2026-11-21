"use client";
import { useState } from "react";
import Link from "next/link";

export type PickItem = { id: string; name: string; table: number; whatsapp: string; code: string; hint: string; href: string };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Barre de recherche fixe + liste d'invités filtrée en direct pendant la frappe, groupée par table. */
export function PermuterPicker({ items, placeholder }: { items: PickItem[]; placeholder: string }) {
  const [q, setQ] = useState("");
  const f = fold(q.trim());
  const tableQ = f.replace(/^table\s*/, "");
  const shown = f ? items.filter((g) => fold(`${g.name} ${g.whatsapp} ${g.whatsapp.replace(/\D/g, "")} ${g.code} table ${g.table}`).includes(f) || String(g.table) === tableQ) : items;
  const by = new Map<number, PickItem[]>();
  for (const g of shown) by.set(g.table, [...(by.get(g.table) || []), g]);

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
      {!shown.length ? (
        <div className="empty">Aucun invité assis ne correspond à « {q.trim()} ». <button type="button" className="btn ghost sm" onClick={() => setQ("")}>Effacer la recherche</button></div>
      ) : (
        <div className="grid" style={{ gap: 14 }}>
          {[...by.entries()].sort((x, y) => x[0] - y[0]).map(([t, gs]) => (
            <section key={t}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Table {t}</h3>
              <div className="list">{gs.map((g) => (
                <Link key={g.id} className="li pickrow" href={g.href}>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{g.name}</b><small className="hint" style={{ display: "block" }}>Table {g.table} · {g.hint}</small></span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}</div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
