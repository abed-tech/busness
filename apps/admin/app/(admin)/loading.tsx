/** État de chargement commun aux pages de l'administration. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      <div className="skeleton" style={{ width: 120, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: 280, height: 30, marginBottom: 24 }} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="card"><div className="skeleton" style={{ width: "50%", marginBottom: 14 }} /><div className="skeleton" style={{ width: "70%", height: 28 }} /></div>)}
      </div>
      <div className="card">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ marginBottom: 14 }} />)}</div>
    </div>
  );
}
