"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader, Icon } from "./AppHeader";

/** Pages hors événement. Les pages d'un événement ont leur propre en-tête (EventNav). */
const PAGES: Record<string, string> = { "/events": "Mes événements", "/events/new": "Nouvel événement", "/profile": "Mon profil" };

export function OrgHeader({ active, logout }: { active: boolean; logout: () => Promise<void> }) {
  const path = usePathname();
  if (/^\/events\/(?!new(\/|$))[^/]+/.test(path)) return null;
  const home = path === "/events";
  const menu = (
    <nav className="navlist" aria-label="Menu principal">
      <span className="grp">Compte</span>
      <Link href="/events" aria-current={home ? "page" : undefined}>Mes événements</Link>
      {active && <Link href="/events/new" aria-current={path === "/events/new" ? "page" : undefined}>Nouvel événement</Link>}
      <Link href="/profile" aria-current={path === "/profile" ? "page" : undefined}>Mon profil</Link>
      <form action={logout}><button className="navbtn" type="submit">Se déconnecter</button></form>
    </nav>
  );
  return (
    <AppHeader
      variant={home ? "home" : "page"}
      title={PAGES[path] || "Skyevenapp"}
      back="/events"
      menuLabel="Menu principal"
      menu={menu}
      right={<Link className="iconbtn" href="/profile" aria-label="Mon profil"><Icon name="user" /></Link>}
    />
  );
}
