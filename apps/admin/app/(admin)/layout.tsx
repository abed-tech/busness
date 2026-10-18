import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/perms";
import { Sidebar } from "@/components/Sidebar";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await requireAdmin();
  return (
    <div className="shell">
      <Sidebar perms={[...s.perms]} name={s.name} roleLabel={ROLE_LABEL[s.role]} logout={logout} />
      <main className="main" id="contenu">{children}</main>
    </div>
  );
}
