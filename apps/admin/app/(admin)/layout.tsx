import type { ReactNode } from "react";
import { requireAdmin, rpc } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/perms";
import { AdminShell, type Notif } from "@/components/Sidebar";
import { logout } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await requireAdmin();
  const n = await rpc<{ items: Notif[] }>("admin_notifications"); // uniquement ce que le rôle peut voir (vérifié par la base)
  return (
    <AdminShell perms={[...s.perms]} name={s.name} roleLabel={ROLE_LABEL[s.role]} logout={logout} notifications={n.ok ? n.data.items || [] : []}>
      {children}
    </AdminShell>
  );
}
