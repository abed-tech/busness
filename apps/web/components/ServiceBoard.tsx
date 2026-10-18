type Item = { table: number; kind: string; item: string; qty: number };

/** Quantités à servir par table (aucun nom d'invité). */
export function ServiceBoard({ items }: { items: Item[] }) {
  if (!items.length) return <div className="empty">Aucune commande confirmée pour l’instant.</div>;
  const tables = [...new Set(items.map((i) => i.table))].sort((a, b) => (a || 1e9) - (b || 1e9));
  return (
    <div className="tables-grid">
      {tables.map((t) => {
        const rows = items.filter((i) => i.table === t);
        return (
          <section key={t} className="tcard">
            <h3><span>{t ? `Table ${t}` : "Sans table"}</span></h3>
            {(["drink", "dish"] as const).map((k) => {
              const r = rows.filter((x) => x.kind === k);
              return r.length ? <div key={k}><p className="eyebrow">{k === "drink" ? "Boissons" : "Plats"}</p>{r.map((x) => <div key={x.item} className="row" style={{ justifyContent: "space-between" }}><span>{x.item}</span><b>× {x.qty}</b></div>)}</div> : null;
            })}
          </section>
        );
      })}
    </div>
  );
}
