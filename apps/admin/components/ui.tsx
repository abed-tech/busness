import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/format";

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ph">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
const STAT_ICON: Record<string, string> = {
  events: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v9H5z",
  users: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 2c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z",
  money: "M4 6h16v12H4zm2 2v8h12V8zm6 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.4l4 2.4-.8 1.3L11 13V7z",
  archive: "M3 3h18v4H3zm1 5h16v13H4zm5 3v2h6v-2z",
  draft: "M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z",
};
/** Carte statistique ; l'icône facultative ne porte jamais seule l'information (le libellé est toujours écrit). */
export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: keyof typeof STAT_ICON }) {
  return (
    <div className="card stat">
      {icon && <span className="stat-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d={STAT_ICON[icon]} /></svg></span>}
      <span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}
    </div>
  );
}
/** En-tête de colonne triable (tri appliqué par la base, l'adresse garde les filtres). */
export function SortTh({ label, k, cur, href, className }: { label: string; k: string; cur: string; href: (sort: string) => string; className?: string }) {
  const on = cur === k;
  return <th className={className} aria-sort={on ? "other" : undefined}><Link className={"sort" + (on ? " on" : "")} href={href(k)}>{label}<span aria-hidden="true">{on ? " ▾" : " ↕"}</span></Link></th>;
}
const TONE: Record<string, string> = { active: "ok", succeeded: "ok", success: "ok", pending: "warn", suspended: "warn", draft: "warn", failed: "bad", denied: "bad", error: "bad", deleted: "bad", refunded: "info", cancelled: "" };
export function StatusBadge({ s }: { s: string }) {
  return <span className={"badge " + (TONE[s] || "")}>{STATUS_LABEL[s] || s}</span>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box" role="alert"><b>Chargement impossible.</b> {message}</div>;
}
export function Pager({ page, size, total, href }: { page: number; size: number; total: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pager">
      <span>{total} résultat{total > 1 ? "s" : ""} · page {page} sur {pages}</span>
      <span className="row">
        {page > 1 ? <Link className="btn ghost sm" href={href(page - 1)}>Précédent</Link> : <span className="btn ghost sm" aria-disabled="true">Précédent</span>}
        {page < pages ? <Link className="btn ghost sm" href={href(page + 1)}>Suivant</Link> : <span className="btn ghost sm" aria-disabled="true">Suivant</span>}
      </span>
    </div>
  );
}
export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><b style={{ width: pct + "%" }} /></div>;
}
