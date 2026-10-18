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
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="card stat"><b>{value}</b><span>{label}</span>{sub && <small>{sub}</small>}</div>;
}
const TONE: Record<string, string> = { active: "ok", succeeded: "ok", success: "ok", pending: "warn", suspended: "warn", failed: "bad", denied: "bad", error: "bad", deleted: "bad", refunded: "info" };
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
