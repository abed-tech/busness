import Link from "next/link";
import { redirect } from "next/navigation";
import { loads, readiness, tableCount } from "@ceremonia/core";
import { requireOrganizer, rpc, origin } from "@/lib/auth";
import { loadEvent, loadGuests, loadCatalog, canWrite, evShape, draftResume } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { paymentMethods } from "@/lib/payments";
import { PageHeader, Stat, Notice } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { CopyButton } from "@/components/CopyButton";
import { date, dateTime, money, TYPE_LABEL, TX_LABEL, plur } from "@/lib/format";
import { updateSettings, rotateServiceKey } from "../actions";
import { startPayment } from "./pay/actions";

type Billing = { free: boolean; persons: number; units: number; unit_cents: number; unit_persons: number; currency: string; due_cents: number; paid_cents: number; pending_cents: number; remaining_cents: number; can_send: boolean };
type Stats = { confirmed_persons: number; presence: { persons: number } };

export default async function EventHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; updated?: string; pay?: string }> }) {
  const me = await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  const ev = await loadEvent(id);
  if (ev.status === "draft") redirect(draftResume(ev)); // non payé : la création n'est pas terminée
  const [guests, catalog, bill, stats] = await Promise.all([loadGuests(id), loadCatalog(id), rpc<Billing>("event_billing", { p_event: id }), rpc<Stats>("event_stats", { p_event: id })]);
  const sb = await serverClient();
  const [{ data: logs }, { data: txs }] = await Promise.all([
    sb.from("event_log").select("at, actor, message").eq("event_id", id).order("at", { ascending: false }).limit(30),
    sb.from("transactions").select("reference, amount_cents, currency, status, method, created_at").eq("event_id", id).order("created_at", { ascending: false }),
  ]);
  const write = canWrite(ev, me);
  const shape = evShape(ev);
  const L = loads(shape, guests);
  const cat = { drinks: catalog.filter((c) => c.kind === "drink").length, dishes: catalog.filter((c) => c.kind === "dish").length };
  const ready = guests.filter((g) => !readiness(ev, guests, g, cat).length).length;
  const persons = guests.reduce((s, g) => s + (g.kind === "couple" ? 2 : 1), 0);
  const tc = tableCount(shape, guests);
  const pm = paymentMethods();
  const b = bill.ok ? bill.data : null;
  const serviceLink = `${origin()}/s/${ev.short_id}/${ev.service_key}`;

  return (
    <>
      <PageHeader eyebrow={`${TYPE_LABEL[ev.type]}${ev.billing === "free_admin" ? " · offert par Skyevenapp" : ""}`} title={ev.title}
        sub={<>{date(ev.event_date)} à {ev.event_time.slice(0, 5)} · {ev.venue}</>}
        actions={<>
          {guests[0] && <a className="btn" href={`/preview/${id}/${guests[0].id}`} target="_blank" rel="noopener">Aperçu de l’invitation ↗</a>}
          {write && <Link className="btn ghost" href={`/events/${id}/edit`}>Modifier</Link>}
        </>} />
      {sp.created && (
        <Notice tone="ok">
          <b>Paiement confirmé : votre événement est créé.</b> L’invitation est générée et ses liens de partage sont actifs ; toutes les fonctions de gestion sont ouvertes.
          <span className="row" style={{ marginTop: 10 }}>
            <Link className="btn sm" href={`/events/${id}/send`}>Partager les invitations</Link>
            <Link className="btn ghost sm" href={`/events/${id}/guests`}>Gérer les invités</Link>
          </span>
        </Notice>
      )}
      {sp.updated && <Notice tone="ok">Modifications enregistrées.</Notice>}
      {sp.pay === "cancel" && <Notice>Paiement annulé : rien n’a été débité.</Notice>}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Invitations" value={guests.length} sub={plur(persons, "personne")} />
        <Stat label="Tables" value={tc} sub={`${ev.table_capacity} places chacune`} />
        <Stat label="Confirmés" value={stats.ok ? stats.data.confirmed_persons : "—"} sub={stats.ok ? `${stats.data.presence.persons} présent(s)` : ""} />
        <Stat label="Prêtes à envoyer" value={ready} sub={`sur ${guests.length}`} />
      </div>
      {!ev.photos.length && <Notice tone="bad">Ajoutez au moins une photo pour l’invitation{write ? <> : <Link href={`/events/${id}/edit`}>Modifier l’événement</Link>, rubrique Photos</> : ""}. Sans photo, l’envoi reste bloqué.</Notice>}
      {L.some((l) => l.used > ev.table_capacity) && <Notice tone="bad">Une table dépasse sa capacité : ouvrez la rubrique Tables.</Notice>}

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <section className="card form">
          <h2>Règlement</h2>
          {!b ? <p className="hint">Indisponible pour le moment.</p> : b.free ? <p>Événement offert par Skyevenapp : aucun règlement n’est demandé.</p> : (
            <>
              <dl className="kv">
                <dt>Personnes facturées</dt><dd>{b.persons} <span className="hint">(le plus grand entre invités et personnes attendues)</span></dd>
                <dt>Tranches de {b.unit_persons}</dt><dd>{b.units} × {money(b.unit_cents, b.currency)}</dd>
                <dt>Déjà réglé</dt><dd>{money(b.paid_cents, b.currency)}</dd>
                <dt>Reste à régler</dt><dd><b>{money(b.remaining_cents, b.currency)}</b></dd>
              </dl>
              <p className="hint">Un couple compte pour deux personnes. Le règlement active l’envoi des invitations.</p>
              {b.pending_cents > 0 && <p className="hint">Un paiement de {money(b.pending_cents, b.currency)} attend la confirmation du prestataire.</p>}
              {b.remaining_cents > 0 && ev.owner_id === me.id && write && (
                <div className="row">
                  {pm.mobile_money && <ActionForm action={startPayment} hidden={{ event_id: id, method: "mobile_money" }} submit={`Payer ${money(b.remaining_cents, b.currency)} par mobile money`} />}
                  {pm.card && <ActionForm action={startPayment} hidden={{ event_id: id, method: "card" }} submit="Payer par carte bancaire" />}
                  {!pm.card && !pm.mobile_money && <p className="notice">Le paiement en ligne n’est pas encore configuré sur la plateforme.</p>}
                </div>
              )}
              {!!txs?.length && <details><summary className="hint">Historique ({txs.length})</summary>{txs.map((t: { reference: string; created_at: string; amount_cents: number; currency: string; status: string }) => <div key={t.reference} className="row" style={{ justifyContent: "space-between" }}><code>{t.reference}</code><span className="hint">{dateTime(t.created_at)}</span><span>{money(t.amount_cents, t.currency)}</span><span className="hint">{TX_LABEL[t.status]}</span></div>)}</details>}
            </>
          )}
        </section>

        <section className="card form">
          <h2>Tables et capacité</h2>
          {write ? (
            <ActionForm action={updateSettings} hidden={{ event_id: id }} submit="Enregistrer">
              <div className="grid g3">
                <div className="fld"><label htmlFor="s-cap">Places par table</label><input id="s-cap" name="table_capacity" type="number" min={1} max={100} defaultValue={ev.table_capacity} required /></div>
                <div className="fld"><label htmlFor="s-exp">Nombre d’invités</label><input id="s-exp" name="expected" type="number" min={1} max={10000} step={1} defaultValue={ev.expected || ""} required /></div>
                <div className="fld"><label htmlFor="s-cc">Indicatif</label><input id="s-cc" name="phone_prefix" defaultValue={ev.phone_prefix} maxLength={5} required /></div>
              </div>
            </ActionForm>
          ) : <p className="hint">{ev.table_capacity} places par table · {ev.expected} invité(s).</p>}
        </section>
      </div>

      <div className="grid g2">
        <section className="card form">
          <h2>Personnel de service</h2>
          <p className="hint">Ce lien ouvre uniquement la page Service : les quantités à servir par table, sans aucun nom d’invité.</p>
          <div className="row">
            <CopyButton text={serviceLink} label="Copier le lien" />
            <a className="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`Lien du service pour « ${ev.title} » (commandes par table) : ${serviceLink}`)}`} target="_blank" rel="noopener noreferrer">Envoyer sur WhatsApp</a>
            {write && <ConfirmAction action={rotateServiceKey} label="Changer le lien" title="Créer un nouveau lien ?" body="L’ancien lien cessera immédiatement de fonctionner. Il faudra envoyer le nouveau au personnel." confirmLabel="Changer le lien" hidden={{ event_id: id }} />}
          </div>
        </section>
        <section className="card">
          <h2>Journal</h2>
          {!logs?.length ? <p className="hint">Aucune modification enregistrée.</p> : (
            <div style={{ display: "grid", gap: 6, maxHeight: 260, overflow: "auto" }}>
              {logs.map((l: { at: string; actor: string; message: string }, i: number) => <div key={i} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}><span>{l.message} <span className="hint">· {l.actor}</span></span><span className="hint" style={{ whiteSpace: "nowrap" }}>{dateTime(l.at)}</span></div>)}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
