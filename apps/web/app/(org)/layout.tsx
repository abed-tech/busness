import type { ReactNode } from "react";
import { requireOrganizer } from "@/lib/auth";
import { OrgHeader } from "@/components/OrgHeader";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const me = await requireOrganizer();
  return (
    <>
      <OrgHeader active={me.status === "active"} logout={logout} />
      {me.status === "suspended" && <div className="org-main" style={{ paddingBottom: 0 }}><div className="notice bad">Votre compte est suspendu : vous pouvez consulter vos événements, mais plus rien modifier. {me.status_reason}</div></div>}
      {children}
    </>
  );
}
