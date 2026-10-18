import Link from "next/link";
import type { ReactNode } from "react";
import { requireOrganizer } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const me = await requireOrganizer();
  return (
    <>
      <header className="org-top">
        <Link href="/events" aria-label="Mes événements"><Logo /></Link>
        <nav className="row" aria-label="Compte">
          <Link className="btn ghost sm hide-m" href="/events">Mes événements</Link>
          <Link className="btn ghost sm" href="/profile">{me.username}</Link>
          <form action={logout}><button className="btn ghost sm" type="submit">Se déconnecter</button></form>
        </nav>
      </header>
      {me.status === "suspended" && <div className="org-main" style={{ paddingBottom: 0 }}><div className="notice bad">Votre compte est suspendu : vous pouvez consulter vos événements, mais plus rien modifier. {me.status_reason}</div></div>}
      {children}
    </>
  );
}
