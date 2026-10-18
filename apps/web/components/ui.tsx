import Link from "next/link";
import type { ReactNode } from "react";

export function Logo() {
  return (
    <span className="brand">
      <svg viewBox="0 0 26 26" width="24" height="24" fill="none" stroke="#d3b270" strokeWidth="1.4" aria-hidden="true"><path d="M13 2l11 11-11 11L2 13z" /><path d="M13 7l6 6-6 6-6-6z" /></svg>
      <b>Cérémonia</b>
    </span>
  );
}
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
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box" role="alert"><b>Chargement impossible.</b> {message}</div>;
}
export function Notice({ tone, children }: { tone?: "ok" | "bad"; children: ReactNode }) {
  return <div className={"notice" + (tone ? " " + tone : "")} role="status" style={{ marginBottom: 14 }}>{children}</div>;
}
export function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><b style={{ width: pct + "%" }} /></div>;
}
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="btn ghost sm" href={href}>← {children}</Link>;
}
