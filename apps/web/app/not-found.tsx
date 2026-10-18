import Link from "next/link";

export default function NotFound() {
  return <div className="auth"><div className="card form" style={{ textAlign: "center" }}><h1 style={{ fontSize: "1.8rem" }}>Page introuvable</h1><p className="hint">Cette page n’existe pas ou vous n’y avez pas accès.</p><Link className="btn" href="/events">Mes événements</Link></div></div>;
}
