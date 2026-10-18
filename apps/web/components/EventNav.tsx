"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function EventNav({ id, title, offer, logout }: { id: string; title: string; offer: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/events/${id}`;
  const d = offer === "both" || offer === "drinks", f = offer === "both" || offer === "food";
  const groups: [string, [string, string, boolean?][]][] = [
    ["Préparer", [["", "Accueil de l’événement"], ["/guests", "Invités"], ["/tables", "Tables"], ["/drinks", "Boissons", d], ["/buffet", "Buffet", f], ["/send", "Envoi des invitations"], ["/edit", "Modifier l’événement"]]],
    ["Jour J", [["/staff/controller", "Contrôleurs"], ["/staff/server", "Serveurs"], ["/presence", "Suivi de présence"], ["/tracking/drinks", "Suivi boissons", d], ["/tracking/dishes", "Suivi plats", f], ["/service", "Service (par table)"]]],
  ];
  const cur = (h: string) => (h === "" ? path === base : path.startsWith(base + h));
  return (
    <>
      <div className="navtoggle" style={{ padding: "12px 16px 0", gap: 10, alignItems: "center" }}>
        <button className="btn ghost sm" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="evnav">☰ Menu</button>
        <span className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </div>
      <nav id="evnav" className={"evnav" + (open ? " open" : "")} aria-label="Menu de l’événement" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        {groups.map(([g, items]) => (
          <div key={g} style={{ display: "grid", gap: 2 }}>
            <span className="grp">{g}</span>
            {items.filter(([, , show]) => show !== false).map(([h, l]) => <Link key={h} href={base + h} aria-current={cur(h) ? "page" : undefined}>{l}</Link>)}
          </div>
        ))}
        <span className="grp">Compte</span>
        <Link href="/events">Mes événements</Link>
        <form action={logout}><button className="navbtn" type="submit">Se déconnecter</button></form>
        {open && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setOpen(false)}>Fermer le menu</button>}
      </nav>
    </>
  );
}
