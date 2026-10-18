"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Perm } from "@/lib/perms";

const ICON: Record<string, string> = {
  dash: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z",
  events: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm-2 8h14v9H5z",
  orgs: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1 .4-2 1.2-2.8A11 11 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z",
  fin: "M4 6h16v12H4zm2 2v8h12V8zm6 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  rep: "M4 20h16v-2H4zm2-4h3V9H6zm5 0h3V4h-3zm5 0h3v-5h-3z",
  audit: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10z",
  set: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.9a7 7 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7 7 0 0 0 1.7 1L11 21h4l.4-2.9a7 7 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
};
const ITEMS: { href: string; label: string; icon: string; perm: Perm }[] = [
  { href: "/", label: "Tableau de bord", icon: "dash", perm: "dashboard.read" },
  { href: "/events", label: "Événements", icon: "events", perm: "events.read" },
  { href: "/organizers", label: "Organisateurs", icon: "orgs", perm: "organizers.read" },
  { href: "/finance", label: "Finances", icon: "fin", perm: "finance.read" },
  { href: "/reports", label: "Rapports", icon: "rep", perm: "reports.read" },
  { href: "/audit", label: "Journal d’activité", icon: "audit", perm: "audit.read" },
  { href: "/settings", label: "Paramètres", icon: "set", perm: "dashboard.read" },
];

export function Sidebar({ perms, name, roleLabel, logout }: { perms: Perm[]; name: string; roleLabel: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const has = new Set(perms);
  const items = ITEMS.filter((i) => has.has(i.perm));
  const cur = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <header className="topbar">
        <b>Cérémonia Admin</b>
        <button className="btn ghost sm" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="sidenav">Menu</button>
      </header>
      <nav id="sidenav" className={"side" + (open ? " open" : "")} aria-label="Navigation administrateur" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        <div className="brand">
          <svg viewBox="0 0 26 26" width="24" height="24" fill="none" stroke="#d3b270" strokeWidth="1.4" aria-hidden="true"><path d="M13 2l11 11-11 11L2 13z" /><path d="M13 7l6 6-6 6-6-6z" /></svg>
          <div><b>Cérémonia</b><small>Administration</small></div>
        </div>
        <div className="nav">
          {items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={cur(i.href) ? "page" : undefined}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICON[i.icon]} /></svg>
              {i.label}
            </Link>
          ))}
        </div>
        <div className="side-foot">
          <div><b>{name}</b><br />{roleLabel}</div>
          <form action={logout}><button className="btn ghost sm" type="submit">Se déconnecter</button></form>
          {open && <button className="btn ghost sm" type="button" onClick={() => setOpen(false)}>Fermer le menu</button>}
        </div>
      </nav>
    </>
  );
}
