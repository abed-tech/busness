"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Perm } from "@/lib/perms";

const ICON: Record<string, string> = {
  dash: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z",
  events: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v9H5z",
  orgs: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1 .4-2 1.2-2.8A11 11 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z",
  fin: "M4 6h16v12H4zm2 2v8h12V8zm6 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  rep: "M4 20h16v-2H4zm2-4h3V9H6zm5 0h3V4h-3zm5 0h3v-5h-3z",
  hist: "M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.1 5l-1.4 1.4A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z",
  audit: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10z",
  set: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.9a7 7 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7 7 0 0 0 1.7 1L11 21h4l.4-2.9a7 7 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
  bell: "M12 22a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z",
  search: "M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z",
  menu: "M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z",
};
const Svg = ({ name, size = 18 }: { name: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={ICON[name]} /></svg>
);

const GROUPS: { title: string; items: { href: string; label: string; icon: string; perm: Perm }[] }[] = [
  { title: "Pilotage", items: [
    { href: "/", label: "Tableau de bord", icon: "dash", perm: "dashboard.read" },
    { href: "/reports", label: "Rapports", icon: "rep", perm: "reports.read" },
  ] },
  { title: "Gestion", items: [
    { href: "/events", label: "Événements", icon: "events", perm: "events.read" },
    { href: "/organizers", label: "Organisateurs", icon: "orgs", perm: "organizers.read" },
    { href: "/finance", label: "Finances", icon: "fin", perm: "finance.read" },
    { href: "/history", label: "Événements supprimés", icon: "hist", perm: "reports.read" },
  ] },
  { title: "Système", items: [
    { href: "/audit", label: "Journal d’activité", icon: "audit", perm: "audit.read" },
    { href: "/settings", label: "Paramètres", icon: "set", perm: "dashboard.read" },
  ] },
];

export type Notif = { kind: string; count: number; label: string; href: string };

/** Fermeture d'un menu déroulant au clic extérieur ou sur Échap. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

/**
 * Cadre de l'administration : navigation latérale à icônes (tiroir sur téléphone) et barre supérieure
 * (recherche, notifications, profil). Les liens ne sont qu'une aide : chaque page revérifie la permission.
 */
export function AdminShell({ perms, name, roleLabel, logout, notifications, children }: {
  perms: Perm[]; name: string; roleLabel: string; logout: () => Promise<void>; notifications: Notif[]; children: ReactNode;
}) {
  const path = usePathname();
  const [nav, setNav] = useState(false);
  const [bell, setBell] = useState(false);
  const [prof, setProf] = useState(false);
  const bellRef = useDismiss(bell, () => setBell(false));
  const profRef = useDismiss(prof, () => setProf(false));
  useEffect(() => { setNav(false); setBell(false); setProf(false); }, [path]);
  const has = new Set(perms);
  const cur = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const total = notifications.reduce((s, n) => s + n.count, 0);
  const initials = name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase() || "A";
  return (
    <div className="shell">
      <nav id="sidenav" className={"side" + (nav ? " open" : "")} aria-label="Navigation administrateur">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 26 26" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 2l11 11-11 11L2 13z" /><path d="M13 7l6 6-6 6-6-6z" /></svg>
          </span>
          <div><b>Skyevenapp</b><small>Administration</small></div>
        </div>
        {GROUPS.map((g) => {
          const items = g.items.filter((i) => has.has(i.perm));
          if (!items.length) return null;
          return (
            <div className="nav" key={g.title}>
              <span className="nav-grp">{g.title}</span>
              {items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={cur(i.href) ? "page" : undefined}><Svg name={i.icon} />{i.label}</Link>
              ))}
            </div>
          );
        })}
        <div className="side-foot">
          <div className="who"><span className="avatar" aria-hidden="true">{initials}</span><div><b>{name}</b><br />{roleLabel}</div></div>
          <form action={logout}><button className="btn ghost sm" type="submit" style={{ width: "100%" }}>Se déconnecter</button></form>
        </div>
      </nav>
      {nav && <div className="side-bg" onClick={() => setNav(false)} aria-hidden="true" />}

      <div className="frame">
        <header className="topbar">
          <button className="iconbtn only-m" type="button" onClick={() => setNav(true)} aria-expanded={nav} aria-controls="sidenav" aria-label="Ouvrir le menu"><Svg name="menu" size={20} /></button>
          <b className="topbar-brand only-m">Skyevenapp</b>
          {has.has("events.read") ? (
            <form className="topsearch" role="search" action="/events">
              <Svg name="search" />
              <input name="q" placeholder="Rechercher un événement, un lieu, un identifiant…" aria-label="Rechercher un événement" />
            </form>
          ) : <span style={{ flex: 1 }} />}
          <div className="dd" ref={bellRef}>
            <button className="iconbtn" type="button" onClick={() => setBell((v) => !v)} aria-expanded={bell} aria-haspopup="true"
              aria-label={total ? `Notifications : ${notifications.length} élément(s) à voir` : "Notifications : rien de nouveau"}>
              <Svg name="bell" size={20} />{total > 0 && <span className="dot">{total > 99 ? "99+" : total}</span>}
            </button>
            {bell && (
              <div className="dd-menu" role="menu">
                <p className="dd-title">Notifications</p>
                {notifications.length ? notifications.map((n, i) => (
                  <Link key={i} role="menuitem" href={n.href} className={"dd-item k-" + n.kind}><i aria-hidden="true" />{n.label}</Link>
                )) : <p className="hint" style={{ padding: "6px 12px 10px" }}>Rien de nouveau.</p>}
              </div>
            )}
          </div>
          <div className="dd" ref={profRef}>
            <button className="avatar-btn" type="button" onClick={() => setProf((v) => !v)} aria-expanded={prof} aria-haspopup="true" aria-label={`Profil : ${name}`}>
              <span className="avatar">{initials}</span><span className="hide-m">{name}</span>
            </button>
            {prof && (
              <div className="dd-menu" role="menu">
                <p className="dd-title">{name}<br /><span className="hint">{roleLabel}</span></p>
                <Link role="menuitem" className="dd-item" href="/settings">Paramètres et sécurité</Link>
                <form action={logout}><button role="menuitem" className="dd-item" type="submit">Se déconnecter</button></form>
              </div>
            )}
          </div>
        </header>
        <main className="main" id="contenu">{children}</main>
      </div>
    </div>
  );
}
