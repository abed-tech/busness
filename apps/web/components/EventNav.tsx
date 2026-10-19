"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { ROLE, isRole } from "@/lib/staff";

type Item = [string, string, boolean?];

const EXTRA: Record<string, string> = { photos: "Vos photos", pay: "Règlement", service: "Service par table" };

/** Titre et page parente de l'adresse courante, à partir des sections du menu. */
function where(rest: string, base: string, items: Item[]): { title: string; back: string } {
  const s = rest.split("/").filter(Boolean);
  const label = (h: string) => items.find(([k]) => k === h)?.[1];
  if (!s.length) return { title: "Accueil de l’événement", back: "/events" };
  const sec = base + "/" + s[0];
  if (s[0] === "staff" && s[1] && isRole(s[1])) {
    const R = ROLE[s[1]];
    if (!s[2]) return { title: R.many, back: base };
    return { title: s[2] === "new" ? `Ajouter des ${R.many.toLowerCase()}` : R.one, back: `${base}/staff/${s[1]}` };
  }
  if (s[0] === "tracking") return { title: label(`/tracking/${s[1]}`) || "Suivi", back: base };
  if (s[0] === "preview") return { title: "Aperçu de l’invitation", back: s[1] ? `${base}/guests/${s[1]}` : `${base}/guests` };
  if (s[1] === "new") return { title: ({ guests: "Ajouter des invités", drinks: "Ajouter des boissons", buffet: "Ajouter des plats" } as Record<string, string>)[s[0]] || "Ajouter", back: sec };
  if (s[1] && s[0] === "guests") return { title: "Fiche invité", back: sec };
  return { title: label("/" + s[0]) || EXTRA[s[0]] || "Événement", back: base };
}

export function EventNav({ id, title, offer, logout }: { id: string; title: string; offer: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const base = `/events/${id}`;
  const d = offer === "both" || offer === "drinks", f = offer === "both" || offer === "food";
  const groups: [string, Item[]][] = [
    ["Préparer", [["", "Accueil de l’événement"], ["/guests", "Invités"], ["/tables", "Tables"], ["/drinks", "Boissons", d], ["/buffet", "Plats", f], ["/send", "Envoi des invitations"], ["/edit", "Modifier l’événement"]]],
    ["Jour J", [["/staff/controller", "Contrôleurs"], ["/staff/server", "Serveurs"], ["/presence", "Suivi de présence"], ["/tracking/drinks", "Suivi boissons", d], ["/tracking/dishes", "Suivi plats", f], ["/service", "Service (par table)"]]],
  ];
  const cur = (h: string) => (h === "" ? path === base : path.startsWith(base + h));
  const here = where(path.slice(base.length), base, groups.flatMap(([, items]) => items));
  const menu = (
    <nav className="navlist" aria-label="Menu de l’événement">
      <p className="navlist-ev">{title}</p>
      {groups.map(([g, items]) => (
        <div key={g} style={{ display: "grid", gap: 2 }}>
          <span className="grp">{g}</span>
          {items.filter(([, , show]) => show !== false).map(([h, l]) => <Link key={h} href={base + h} aria-current={cur(h) ? "page" : undefined}>{l}</Link>)}
        </div>
      ))}
      <span className="grp">Compte</span>
      <Link href="/events">Mes événements</Link>
      <form action={logout}><button className="navbtn" type="submit">Se déconnecter</button></form>
    </nav>
  );
  return <AppHeader variant="page" title={here.title} back={here.back} menuLabel="Menu de l’événement" menu={menu} />;
}
