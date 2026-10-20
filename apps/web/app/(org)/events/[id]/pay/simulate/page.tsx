import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { loadEvent } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader } from "@/components/ui";
import { StepHeader } from "@/components/EventForm";
import { SimulatedPayForm, RetryPayForm } from "@/components/SimulatedPayment";
import { money, date, plur } from "@/lib/format";
import { startSimulatedPayment, completeSimulatedPayment } from "../actions";

type Tx = { reference: string; amount_cents: number; currency: string; status: string; persons: number; provider: string; confirmed_at: string | null;
  event_snapshot: { title?: string; expected?: number; units?: number; unit_cents?: number; unit_persons?: number } };

const STATE: Record<string, { label: string; tone: string }> = {
  pending: { label: "Paiement en attente", tone: "warn" }, succeeded: { label: "Paiement simulé réussi", tone: "ok" },
  failed: { label: "Paiement simulé échoué", tone: "bad" }, cancelled: { label: "Paiement annulé", tone: "bad" },
};

/**
 * Paiement simulé : récapitulatif calculé par la base, puis issue choisie (réussi, échoué, annulé).
 * Aucune donnée bancaire n'est demandée et aucun argent n'est transféré. L'événement n'est créé qu'en cas de réussite.
 */
export default async function SimulatedPayment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  const sp = await searchParams;
  const ev = await loadEvent(id);
  const sb = await serverClient();
  const { data } = await sb.from("transactions").select("reference, amount_cents, currency, status, persons, provider, confirmed_at, event_snapshot")
    .eq("reference", sp.ref || "").eq("event_id", id).maybeSingle();
  const tx = data as Tx | null;
  const back = <a className="btn ghost" href={`/preview/${id}`}>Retour à l’aperçu</a>;

  if (!tx || tx.provider !== "simulation") {
    return (
      <>
        <PageHeader eyebrow="Paiement" title="Paiement introuvable" />
        <div className="card form" style={{ maxWidth: 620 }}>
          <p className="hint">Ce paiement n’existe pas ou n’est plus disponible.</p>
          <div className="row">{ev.status === "draft" ? back : <Link className="btn" href={`/events/${id}`}>Accéder à mon événement</Link>}</div>
        </div>
      </>
    );
  }
  const s = STATE[tx.status] || { label: tx.status, tone: "" };
  const snap = tx.event_snapshot || {};
  const amount = money(tx.amount_cents, tx.currency);
  return (
    <>
      {ev.status === "draft" && <StepHeader step={8} />}
      <PageHeader eyebrow="Générer mon invitation" title={tx.status === "succeeded" ? "Votre événement est créé" : "Récapitulatif et paiement"} />
      <div className="pay-grid">
        <section className="card form pay-card" aria-labelledby="recap">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="recap">Récapitulatif</h2>
            <span className={"badge " + s.tone} role="status">{s.label}</span>
          </div>
          <dl className="kv">
            <dt>Événement</dt><dd><b>{snap.title || ev.title}</b><br /><span className="hint">{date(ev.event_date)} · {ev.venue}</span></dd>
            <dt>Nombre d’invités</dt><dd>{snap.expected ?? ev.expected}{tx.persons !== (snap.expected ?? ev.expected) && <span className="hint"> · {plur(tx.persons, "personne")} facturée(s) d’après la liste d’invités</span>}</dd>
            {snap.unit_cents != null && snap.unit_persons != null && <>
              <dt>Prix unitaire</dt><dd>{money(snap.unit_cents, tx.currency)} par tranche de {snap.unit_persons} personnes</dd>
              <dt>Tranches</dt><dd>{snap.units} × {money(snap.unit_cents, tx.currency)}</dd>
            </>}
            <dt>Total à payer</dt><dd className="pay-total">{amount}</dd>
            <dt>Référence</dt><dd><code>{tx.reference}</code></dd>
          </dl>
          <p className="sim-flag" role="note"><b>Simulation</b> — aucun paiement réel : aucune donnée bancaire n’est demandée et aucun argent n’est transféré.</p>
        </section>

        <section className="card form pay-card" aria-live="polite">
          {tx.status === "pending" && <>
            <h2>Paiement simulé</h2>
            <p className="hint">Choisissez l’issue du paiement pour tester le parcours. Votre événement est créé uniquement si le paiement réussit.</p>
            <SimulatedPayForm action={completeSimulatedPayment} eventId={id} reference={tx.reference} amount={amount} />
            <div className="row">{back}</div>
          </>}
          {tx.status === "succeeded" && <>
            <h2>Paiement confirmé</h2>
            <div className="notice ok" role="status">Votre événement est créé : l’invitation est générée, ses liens de partage sont actifs et toutes les fonctions de gestion sont ouvertes.</div>
            <div className="row">
              <Link className="btn" href={`/events/${id}?created=1`}>Accéder à mon événement</Link>
              <Link className="btn ghost" href={`/events/${id}/send`}>Partager les invitations</Link>
            </div>
          </>}
          {(tx.status === "failed" || tx.status === "cancelled") && <>
            <h2>{tx.status === "failed" ? "Le paiement n’a pas abouti" : "Paiement annulé"}</h2>
            <div className="notice bad" role="status">Aucun événement n’a été créé. Vos informations et vos photos sont conservées : vous pouvez réessayer sans tout recommencer.</div>
            {ev.status === "draft" ? <>
              <RetryPayForm action={startSimulatedPayment} eventId={id} />
              <div className="row">{back}<Link className="btn ghost" href={`/events/${id}/draft`}>Modifier les informations</Link></div>
            </> : <div className="row"><Link className="btn" href={`/events/${id}`}>Accéder à mon événement</Link></div>}
          </>}
        </section>
      </div>
    </>
  );
}
