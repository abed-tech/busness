import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { SearchAdd } from "@/components/SearchAdd";
import { ROLE, isRole } from "@/lib/staff";
import { plur } from "@/lib/format";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export default async function StaffList({ params, searchParams }: { params: Promise<{ id: string; role: string }>; searchParams: Promise<{ deleted?: string; q?: string }> }) {
  const me = await requireOrganizer();
  const { id, role } = await params;
  if (!isRole(role)) notFound();
  const sp = await searchParams;
  const ev = await loadEvent(id);
  const sb = await serverClient();
  const [{ data: staff }, { data: acts }] = await Promise.all([
    sb.from("staff_accounts").select("id, name, access_code, revoked, last_login_at, locked_until").eq("event_id", id).eq("role", role).order("created_at"),
    role === "controller" ? sb.from("entries").select("staff_id").eq("event_id", id) : sb.from("services").select("staff_id").eq("event_id", id),
  ]);
  const n = (sid: string) => (acts || []).filter((a: { staff_id: string }) => a.staff_id === sid).length;
  const R = ROLE[role];
  const q = fold(sp.q || "");
  const shown = (staff || []).filter((s: { name: string; access_code: string }) => !q || fold(s.name + " " + s.access_code).includes(q));
  return (
    <>
      <PageHeader eyebrow="Jour J" title={R.many} sub={role === "controller" ? "Ils scannent les QR codes et valident les entrées." : "Ils scannent les QR codes et enregistrent les boissons et plats servis."} />
      {sp.deleted && <Notice tone="ok">Accès supprimé.</Notice>}
      <SearchAdd q={sp.q} placeholder="Rechercher un nom ou un code" addHref={canWrite(ev, me) ? `/events/${id}/staff/${role}/new` : undefined} addLabel={`Ajouter des ${R.many.toLowerCase()}`} />
      {!staff?.length ? <Empty>Aucun {R.one.toLowerCase()} pour l’instant.</Empty> : !shown.length ? <Empty>Aucun {R.one.toLowerCase()} ne correspond.</Empty> : (
        <div className="list">
          {shown.map((s: { id: string; name: string; access_code: string; revoked: boolean }) => (
            <Link key={s.id} className="li" href={`/events/${id}/staff/${role}/${s.id}`}>
              <span><b>{s.name}</b><small>Code {s.access_code} · {s.revoked ? "accès révoqué" : "actif"} · {role === "controller" ? plur(n(s.id), "entrée confirmée", "entrées confirmées") : plur(n(s.id), "prestation")}</small></span>
              {s.revoked ? <span className="badge bad">Révoqué</span> : <span className="badge ok">Actif</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
