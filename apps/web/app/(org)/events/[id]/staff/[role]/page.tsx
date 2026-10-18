import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizer, origin } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { StaffCreate } from "@/components/StaffCreate";
import { ROLE, isRole } from "@/lib/staff";
import { plur } from "@/lib/format";

export default async function StaffList({ params, searchParams }: { params: Promise<{ id: string; role: string }>; searchParams: Promise<{ deleted?: string }> }) {
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
  return (
    <>
      <PageHeader eyebrow="Jour J" title={R.many} sub={role === "controller" ? "Ils scannent les QR codes et valident les entrées." : "Ils scannent les QR codes et enregistrent les boissons et plats servis."} />
      {sp.deleted && <Notice tone="ok">Accès supprimé.</Notice>}
      {canWrite(ev, me) && <div style={{ marginBottom: 16 }}><StaffCreate eventId={id} role={role} label={R.one} placeholder={R.ph} linkBase={`${origin()}/k/${ev.short_id}/`} eventTitle={ev.title} /></div>}
      {!staff?.length ? <Empty>Aucun {R.one.toLowerCase()} pour l’instant.</Empty> : (
        <div className="list">
          {staff.map((s: { id: string; name: string; access_code: string; revoked: boolean }) => (
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
