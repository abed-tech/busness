import Link from "next/link";
import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox } from "@/components/ui";
import { TYPE_LABEL } from "@/lib/format";
import { updateEvent } from "../../actions";
import { ActionForm } from "../ActionForm";

type Ev = Record<string, any>;

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("events.write");
  const { id } = await params;
  const r = await rpc<{ event: Ev }>("admin_event_detail", { p_event: id });
  if (!r.ok) return <ErrorBox message={r.message} />;
  const e = r.data.event;
  if (e.status === "deleted") return <ErrorBox message="Cet événement a été supprimé : il ne peut plus être modifié." />;
  const f = (name: string, label: string, props: Record<string, unknown> = {}) => (
    <div className="fld"><label htmlFor={name}>{label}</label><input id={name} name={name} defaultValue={e[name] ?? ""} {...props} /></div>
  );
  return (
    <>
      <PageHeader eyebrow="Modifier" title={e.title} actions={<Link className="btn ghost sm" href={`/events/${id}`}>Retour à l’événement</Link>} />
      <div style={{ maxWidth: 860 }}>
        <ActionForm action={updateEvent} hidden={{ event_id: id, phone_prefix: e.phone_prefix || "+243" }} submit="Enregistrer les modifications">
          <section className="card form">
            <h2>Informations</h2>
            <div className="grid g2">
              <div className="fld"><label htmlFor="type">Type</label>
                <select id="type" name="type" defaultValue={e.type}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              {f("title", "Titre", { required: true, maxLength: 160 })}
              {f("host_a", "Nom principal", { maxLength: 80 })}
              {f("host_b", "Second nom (facultatif)", { maxLength: 80 })}
              {f("event_date", "Date", { type: "date", required: true })}
              <div className="fld"><label htmlFor="event_time">Heure</label><input id="event_time" name="event_time" type="time" required defaultValue={String(e.event_time || "").slice(0, 5)} /></div>
              {f("venue", "Lieu", { required: true, maxLength: 160 })}
              {f("address", "Adresse", { required: true, maxLength: 300 })}
              {f("dress", "Tenue (facultatif)", { maxLength: 160 })}
            </div>
            <div className="fld"><label htmlFor="message">Message d’invitation</label><textarea id="message" name="message" maxLength={2000} defaultValue={e.message || ""} /></div>
            <div className="fld"><label htmlFor="program">Programme</label><textarea id="program" name="program" maxLength={3000} defaultValue={e.program || ""} /></div>
          </section>
          <section className="card form">
            <h2>Capacité et menu</h2>
            <div className="grid g3">
              {f("expected", "Personnes attendues", { type: "number", min: 0, max: 10000, required: true })}
              {f("table_capacity", "Places par table", { type: "number", min: 1, max: 100, required: true })}
              <div className="fld"><label htmlFor="offer">Ce qui est proposé</label>
                <select id="offer" name="offer" defaultValue={e.offer}>
                  <option value="both">Boissons et buffet</option><option value="drinks">Boissons seulement</option><option value="food">Buffet seulement</option><option value="none">Ni boissons ni buffet</option>
                </select></div>
            </div>
            <p className="hint">Réduire les places par table est refusé par le serveur si une table se retrouve en surcharge : déplacez d’abord les invités concernés.</p>
          </section>
        </ActionForm>
      </div>
    </>
  );
}
