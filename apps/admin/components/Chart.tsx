/**
 * Histogramme mensuel d'une seule série, en SVG rendu côté serveur (aucune bibliothèque, compatible CSP).
 * Une barre par mois, ancrée sur la ligne de base, coins arrondis en haut ; grille discrète ; info-bulle au survol
 * (zone de survol sur toute la hauteur du mois) ; étiquettes directes sur le dernier mois et le maximum seulement ;
 * tableau des valeurs disponible (accessibilité, lecture sans couleur).
 */
export type Point = { label: string; full: string; value: number; display: string };

const W = 640, H = 220, PAD = { t: 22, r: 8, b: 26, l: 46 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) || v;
}

export function MonthBars({ title, points, color, axis }: { title: string; points: Point[]; color: string; axis: (v: number) => string }) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const step = iw / Math.max(1, points.length);
  const bw = Math.max(6, Math.min(28, step - 2)); // espace d'au moins 2 px entre deux barres
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const peak = points.reduce((k, p, i) => (p.value > points[k].value ? i : k), 0);
  const ticks = [0, max / 2, max];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} : ${points.map((p) => `${p.full} ${p.display}`).join(", ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{axis(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.l + step * i + step / 2, top = y(p.value), h = PAD.t + ih - top;
          const r = Math.min(4, h / 2, bw / 2);
          const label = p.value > 0 && (i === points.length - 1 || i === peak);
          return (
            <g key={i} className="col">
              <title>{`${p.full} : ${p.display}`}</title>
              <rect x={cx - step / 2} y={PAD.t} width={step} height={ih} className="hit" />
              {h > 0 && <path d={`M${cx - bw / 2},${PAD.t + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${PAD.t + ih} Z`} fill={color} className="bar" />}
              {label && <text x={cx} y={top - 6} textAnchor="middle" className="val">{p.display}</text>}
              <text x={cx} y={H - 8} textAnchor="middle" className="axis">{p.label}</text>
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="base" />
      </svg>
      <details className="chart-table">
        <summary>Voir les valeurs</summary>
        <table className="tbl"><thead><tr><th>Mois</th><th className="r">{title}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.full}><td>{p.full}</td><td className="r">{p.display}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
