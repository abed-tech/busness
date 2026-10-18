import { notFound } from "next/navigation";
import { requireOrganizer, origin } from "@/lib/auth";
import { loadEvent, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, BackLink } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { CopyButton } from "@/components/CopyButton";
import { ROLE, isRole } from "@/lib/staff";
import { dateTime } from "@/lib/format";
import { setRevoked, resetPassword, deleteStaff } from "../../actions";

export default async function StaffDetail({ params }: { params: Promise<{ id: string; role: string; sid: string }> }) {
  const me = await requireOrganizer();
  const { id, role, sid } = await params;
  if (!isRole(role)) notFound();
  const ev = await loadEvent(id);
  const sb = await serverClient();
  const { data: s } = await sb.from("staff_accounts").select("id, name, access_code, revoked, last_login_at, locked_until, role").eq("id", sid).eq("event_id", id).maybeSingle();
  if (!s || s.role !== role) notFound();
  const R = ROLE[role];
  const link = `${origin()}/k/${ev.short_id}/${s.id}`;
  const write = canWrite(ev, me);
  const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;
  return (
    <>
      <PageHeader eyebrow={R.one} title={s.name} sub={`${s.revoked ? "Accès révoqué" : "Accès actif"} · dernière connexion : ${s.last_login_at ? dateTime(s.last_login_at) : "jamais"}`} actions={<BackLink href={`/events/${id}/staff/${role}`}>{R.many}</BackLink>} />
      <div className="grid g2">
        <section className="card form">
          <h2>Transmettre l’accès</h2>
          <div className="codebox"><span>Code d’accès</span><b>{s.access_code}</b></div>
          <p className="hint">Le lien ne contient aucun secret. Le mot de passe n’est jamais réaffiché : créez-en un nouveau si besoin.</p>
          <div className="row">
            <a className="btn ghost sm" href={wa(`${R.one} pour « ${ev.title} » : ${link}`)} target="_blank" rel="noopener noreferrer">Envoyer le lien</a>
            <a className="btn ghost sm" href={wa(`Code d’accès : ${s.access_code}`)} target="_blank" rel="noopener noreferrer">Envoyer le code</a>
            <CopyButton text={link} label="Copier le lien" />
          </div>
        </section>
        {write && (
          <section className="card form">
            <h2>Gérer l’accès</h2>
            <ActionForm action={resetPassword} hidden={{ event_id: id, staff_id: s.id }} submit="Changer le mot de passe">
              <div className="fld"><label htmlFor="pw">Nouveau mot de passe</label><input id="pw" name="password" type="text" minLength={6} maxLength={64} required autoComplete="new-password" spellCheck={false} /></div>
            </ActionForm>
            <div className="row">
              {s.revoked
                ? <ConfirmAction action={setRevoked} label="Rétablir l’accès" title="Rétablir l’accès ?" body="La personne pourra se reconnecter avec son code et son mot de passe." confirmLabel="Rétablir" hidden={{ event_id: id, staff_id: s.id, revoked: "0" }} />
                : <ConfirmAction action={setRevoked} danger label="Révoquer l’accès" title="Révoquer l’accès ?" body="La personne est déconnectée immédiatement sur tous ses appareils." confirmLabel="Révoquer" hidden={{ event_id: id, staff_id: s.id, revoked: "1" }} />}
              <ConfirmAction action={deleteStaff} danger label="Supprimer" title={`Supprimer l’accès de ${s.name} ?`} body="L’historique des entrées et prestations est conservé, sans lien vers ce compte." confirmLabel="Supprimer" hidden={{ event_id: id, staff_id: s.id, role }} />
            </div>
            <p className="hint">Changer le mot de passe ou révoquer déconnecte immédiatement ce {R.one.toLowerCase()}.</p>
          </section>
        )}
      </div>
    </>
  );
}
