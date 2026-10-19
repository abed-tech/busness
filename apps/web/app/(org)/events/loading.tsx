/** Affiché pendant que le serveur charge la page (liste des événements ou page d'un événement). */
export default function Loading() {
  return (
    <main className="org-main" aria-busy="true">
      <p className="hint" role="status" style={{ marginBottom: 16 }}>Chargement…</p>
      <div className="list">
        {[0, 1, 2].map((i) => <div key={i} className="li" style={{ height: 78 }}><div className="skeleton" style={{ width: `${60 - i * 12}%` }} /></div>)}
      </div>
    </main>
  );
}
