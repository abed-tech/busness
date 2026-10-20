"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { parseGuests, tableCount, priceCents, KIND_LABEL } from "@ceremonia/core";
import { readGuestFile } from "@/lib/client/readGuestFile";
import { TYPES, titleOf, money } from "@/lib/format";
import { GUEST_COUNT } from "@/lib/schemas";
import type { ActionState } from "@/components/ConfirmAction";

type Initial = Partial<Record<"type" | "host_a" | "host_b" | "title" | "event_date" | "event_time" | "venue" | "address" | "dress" | "message" | "program" | "offer" | "phone_prefix", string>> & { expected?: number; table_capacity?: number };

/**
 * Écrans de la création ; le 8ᵉ (photos) suit l'enregistrement du brouillon, car une photo a besoin de l'événement.
 * Le 9ᵉ (aperçu de l'invitation) précède le paiement : l'événement n'est créé définitivement qu'après le paiement.
 */
export const CREATE_STEPS = ["L’événement", "Le lieu", "Les tables", "Boissons et buffet", "Message et programme", "Les invités", "Récapitulatif", "Vos photos", "Aperçu"];
const OFFER_LABEL: Record<string, string> = { both: "Une boisson et un plat par personne", drinks: "Une boisson par personne", food: "Un plat par personne", none: "Rien à choisir" };

/** Indicateur « Étape x sur 8 », partagé avec l'écran des photos. */
export function StepHeader({ step }: { step: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="eyebrow">Étape {step + 1} sur {CREATE_STEPS.length} · {CREATE_STEPS[step]}</p>
      <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: `repeat(${CREATE_STEPS.length}, 1fr)`, gap: 6, marginTop: 8 }}>
        {CREATE_STEPS.map((_, i) => <i key={i} style={{ height: 4, borderRadius: 2, background: i <= step ? "var(--accent)" : "var(--line)" }} />)}
      </div>
    </div>
  );
}

/** Listes déjà saisies d'un brouillon (retour aux étapes depuis l'aperçu, avant le paiement). */
export type DraftLists = { drinks: string; dishes: string; guests: string };

/**
 * Formulaire d'événement : création écran par écran (avec listes et invités) ou modification sur une page.
 * Un brouillon non payé (draft) se modifie avec les mêmes écrans que la création, déjà remplis.
 */
export function EventForm({ action, initial, eventId, unit, draft }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; initial?: Initial; eventId?: string; unit?: { cents: number; persons: number; currency: string }; draft?: DraftLists }) {
  const creating = !eventId || !!draft;
  const [state, run, pending] = useActionState<ActionState, FormData>(action, null);
  const [type, setType] = useState(initial?.type || "mariage");
  const T = TYPES[type];
  const [a, setA] = useState(initial?.host_a || "");
  const [b, setB] = useState(initial?.host_b || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [titleEdited, setTitleEdited] = useState(!!initial?.title);
  const [message, setMessage] = useState(initial?.message ?? T.msg);
  const [program, setProgram] = useState(initial?.program ?? T.prog);
  const [textEdited, setTextEdited] = useState(!!eventId);
  const [cap, setCap] = useState(initial?.table_capacity ?? T.cap);
  const [expected, setExpected] = useState(initial?.expected ?? 0);
  const [prefix, setPrefix] = useState(initial?.phone_prefix || "+243");
  const [offer, setOffer] = useState(initial?.offer || "both");
  const [guests, setGuests] = useState(draft?.guests || "");
  const [fileErr, setFileErr] = useState("");
  const parsed = useMemo(() => (guests.trim() ? parseGuests(guests, prefix) : null), [guests, prefix]);
  const persons = parsed ? parsed.rows.reduce((s, r) => s + (r.kind === "couple" ? 2 : 1), 0) : 0;
  const tc = cap > 0 ? tableCount({ table_capacity: cap, expected, extra_tables: 0 }, parsed ? parsed.rows.map((r) => ({ kind: r.kind || null })) : []) : 0;
  const shownTitle = titleEdited ? title : titleOf(type, a, b);
  const formRef = useRef<HTMLFormElement>(null);
  const expRef = useRef<HTMLInputElement>(null);
  // nombre d'invités obligatoire (il sert au prix) : message explicite, revérifié par le serveur et la base
  useEffect(() => {
    expRef.current?.setCustomValidity(!Number.isInteger(expected) || expected < 1 ? GUEST_COUNT : expected > 10000 ? "Nombre d’invités : 10 000 au maximum." : "");
  }, [expected]);
  const [step, setStep] = useState(0);
  const [snap, setSnap] = useState<Record<string, string>>({});
  const LAST = 6; // récapitulatif : dernier écran avant l'enregistrement
  const shown = (i: number) => !creating || step === i;

  /** Vérifie les champs d'un écran ; affiche la première erreur. */
  function stepValid(i: number): boolean {
    const sec = formRef.current?.querySelector<HTMLElement>(`[data-step="${i}"]`);
    if (!sec) return true;
    const bad = Array.from(sec.querySelectorAll<HTMLInputElement>("input, select, textarea")).find((el) => !el.checkValidity());
    if (!bad) return true;
    if (step !== i) { setStep(i); setTimeout(() => bad.reportValidity(), 0); } else bad.reportValidity();
    return false;
  }
  function goTo(i: number) {
    if (i > step) for (let k = step; k < i; k++) if (!stepValid(k)) return;
    if (formRef.current) setSnap(Object.fromEntries(Array.from(new FormData(formRef.current).entries()).map(([k, v]) => [k, String(v)])));
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function onSubmit(e: { preventDefault(): void }) {
    if (!creating) return;
    if (step < LAST) { e.preventDefault(); goTo(step + 1); return; }
    for (let k = 0; k < LAST; k++) if (!stepValid(k)) { e.preventDefault(); return; }
  }

  function pickType(t: string) {
    setType(t);
    if (!textEdited) { setMessage(TYPES[t].msg); setProgram(TYPES[t].prog); }
    if (!eventId) setCap(TYPES[t].cap);
  }

  return (
    <form ref={formRef} action={run} onSubmit={onSubmit} className="form" style={{ maxWidth: 860 }} noValidate={creating}>
      {creating && <StepHeader step={step} />}
      {eventId && <input type="hidden" name="event_id" value={eventId} />}
      <section className="card form" data-step={0} hidden={!shown(0)}>
        <h2>L’événement</h2>
        <div className="fld"><label htmlFor="type">Type</label>
          <select id="type" name="type" value={type} onChange={(e) => pickType(e.target.value)}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="grid g2">
          <div className="fld"><label htmlFor="host_a">{T.a}</label><input id="host_a" name="host_a" maxLength={80} value={a} onChange={(e) => setA(e.target.value)} /></div>
          {T.b ? <div className="fld"><label htmlFor="host_b">{T.b}</label><input id="host_b" name="host_b" maxLength={80} value={b} onChange={(e) => setB(e.target.value)} /></div> : <input type="hidden" name="host_b" value="" />}
        </div>
        <div className="fld"><label htmlFor="title">Titre affiché sur l’invitation</label>
          <input id="title" name="title" required maxLength={160} value={shownTitle} onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }} placeholder="Patrick & Grâce" /></div>
        <div className="grid g2">
          <div className="fld"><label htmlFor="event_date">Date</label><input id="event_date" name="event_date" type="date" required defaultValue={initial?.event_date} /></div>
          <div className="fld"><label htmlFor="event_time">Heure</label><input id="event_time" name="event_time" type="time" required defaultValue={(initial?.event_time || "16:00").slice(0, 5)} /></div>
        </div>
      </section>

      <section className="card form" data-step={1} hidden={!shown(1)}>
        <h2>Le lieu</h2>
        <div className="fld"><label htmlFor="venue">Nom du lieu</label><input id="venue" name="venue" required maxLength={160} defaultValue={initial?.venue} placeholder="Salle Le Prestige" /></div>
        <div className="fld"><label htmlFor="address">Adresse</label><input id="address" name="address" required maxLength={300} defaultValue={initial?.address} placeholder="Boulevard du 30 Juin, Gombe, Kinshasa" /></div>
        <div className="fld"><label htmlFor="dress">Tenue (facultatif)</label><input id="dress" name="dress" maxLength={160} defaultValue={initial?.dress} placeholder="Tenue de soirée" /></div>
      </section>

      <section className="card form" data-step={2} hidden={!shown(2)}>
        <h2>Les tables</h2>
        <div className="grid g3">
          <div className="fld"><label htmlFor="table_capacity">Places par table</label><input id="table_capacity" name="table_capacity" type="number" inputMode="numeric" min={1} max={100} value={cap} onChange={(e) => setCap(Number(e.target.value))} required /></div>
          <div className="fld"><label htmlFor="expected">Nombre d’invités</label><input ref={expRef} id="expected" name="expected" type="number" inputMode="numeric" min={1} max={10000} step={1} required value={expected || ""} placeholder="Ex. 150" onChange={(e) => setExpected(Number(e.target.value))} /></div>
          <div className="fld"><label htmlFor="phone_prefix">Indicatif WhatsApp par défaut</label><input id="phone_prefix" name="phone_prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={5} required /></div>
        </div>
        <p className="hint">{cap > 0 ? `${tc} table(s) de ${cap} places. Un couple occupe toujours 2 places à la même table.` : "Indiquez le nombre de places par table."}</p>
      </section>

      <section className="card form" data-step={3} hidden={!shown(3)}>
        <h2>Boissons et buffet</h2>
        <div className="fld"><label htmlFor="offer">Ce que les invités choisissent</label>
          <select id="offer" name="offer" value={offer} onChange={(e) => setOffer(e.target.value)}>
            <option value="both">Une boisson et un plat par personne</option><option value="drinks">Une boisson par personne</option><option value="food">Un plat par personne</option><option value="none">Rien à choisir</option>
          </select>
        </div>
        {creating ? (
          <div className="grid g2">
            {(offer === "both" || offer === "drinks") && <div className="fld"><label htmlFor="drinks">Boissons proposées (une par ligne)</label><textarea id="drinks" name="drinks" defaultValue={draft?.drinks} placeholder={"Coca-Cola\nFanta\nPrimus\nEau minérale"} /></div>}
            {(offer === "both" || offer === "food") && <div className="fld"><label htmlFor="dishes">Plats proposés (un par ligne)</label><textarea id="dishes" name="dishes" defaultValue={draft?.dishes} placeholder={"Poulet braisé\nPoisson\nPlat végétarien"} /></div>}
          </div>
        ) : <p className="hint">Les listes se modifient dans les rubriques Boissons et Buffet.</p>}
      </section>

      <section className="card form" data-step={4} hidden={!shown(4)}>
        <h2>Message et programme</h2>
        <div className="fld"><label htmlFor="message">Message aux invités</label><textarea id="message" name="message" maxLength={2000} value={message} onChange={(e) => { setMessage(e.target.value); setTextEdited(true); }} /></div>
        <div className="fld"><label htmlFor="program">Programme (« heure | activité », une ligne chacune)</label><textarea id="program" name="program" maxLength={3000} value={program} onChange={(e) => { setProgram(e.target.value); setTextEdited(true); }} style={{ minHeight: 130 }} /></div>
      </section>

      {creating && (
        <section className="card form" data-step={5} hidden={!shown(5)}>
          <h2>Les invités (facultatif)</h2>
          <p className="hint">Une invitation par ligne : Nom ; Statut ; WhatsApp. Collez une liste ou importez un fichier Excel (.xlsx) ou CSV. Vous pourrez aussi les ajouter plus tard.{draft && " Cette liste remplace celle déjà enregistrée dans votre brouillon."}</p>
          <div className="fld"><label htmlFor="guests">Liste</label><textarea id="guests" name="guests" value={guests} onChange={(e) => setGuests(e.target.value)} style={{ minHeight: 150 }} placeholder={"Mr Luc Mbuyi ; Monsieur ; 081 000 0001\nCouple Bola ; Couple ; +243 81 000 0002\nMme Lucie ; Madame"} /></div>
          <div className="row">
            <label className="btn ghost sm" style={{ position: "relative" }}>Importer un fichier
              <input type="file" accept=".xlsx,.csv,.txt,.tsv" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setFileErr(""); try { setGuests(await readGuestFile(f)); } catch (er) { setFileErr((er as Error).message); } }} />
            </label>
            {fileErr && <span className="badge bad">{fileErr}</span>}
          </div>
          {parsed && (
            <div className={"notice " + (parsed.rows.length ? "ok" : "bad")}>
              <b>{parsed.rows.length} invitation(s)</b> · {persons} personne(s)
              {parsed.rows.slice(0, 4).map((r, i) => <div key={i} className="hint">{r.name} · {r.kind ? KIND_LABEL[r.kind] : "statut à préciser"}{r.whatsapp ? " · " + r.whatsapp : ""}</div>)}
              {parsed.issues.length > 0 && <div className="hint" style={{ color: "var(--warn)" }}>{parsed.issues.length} remarque(s) : {parsed.issues.slice(0, 3).join(" ")}</div>}
            </div>
          )}
          <label className="check"><input type="checkbox" name="auto" defaultChecked /> Placer automatiquement les invités à table</label>
          {unit && <p className="hint">Tarif : {money(unit.cents, unit.currency)} par tranche de {unit.persons} personnes. Estimation actuelle : <b>{money(priceCents(Math.max(persons, expected), unit.cents, unit.persons), unit.currency)}</b>. Le règlement se fait après l’aperçu de l’invitation : l’événement est créé une fois le paiement confirmé.</p>}
        </section>
      )}

      {creating && (
        <section className="card form" data-step={6} hidden={!shown(6)}>
          <h2>Récapitulatif</h2>
          <dl className="kv">
            <dt>Titre</dt><dd>{snap.title || shownTitle || "—"}</dd>
            <dt>Date et heure</dt><dd>{snap.event_date ? new Date(snap.event_date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"} à {snap.event_time || "—"}</dd>
            <dt>Lieu</dt><dd>{[snap.venue, snap.address].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Nombre d’invités</dt><dd>{expected || "—"}</dd>
            <dt>Tables</dt><dd>{tc} table(s) de {cap} places</dd>
            <dt>Choix des invités</dt><dd>{OFFER_LABEL[offer]}</dd>
            <dt>Invités</dt><dd>{parsed ? `${parsed.rows.length} invitation(s) · ${persons} personne(s)` : "Aucun pour l’instant"}</dd>
          </dl>
          <p className="hint">Après l’enregistrement : ajoutez au moins une photo (elle sert de fond à l’invitation), puis vérifiez l’aperçu de l’invitation avant le paiement.</p>
        </section>
      )}

      {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="alert">{state.message}</div>}
      {creating ? (
        <div className="row" style={{ justifyContent: "space-between" }}>
          {step > 0 ? <button className="btn ghost" type="button" onClick={() => goTo(step - 1)} disabled={pending}>Précédent</button> : <span />}
          {step < LAST
            ? <button className="btn" type="submit" key="next">Suivant</button>
            : <button className="btn" type="submit" key="save" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer et continuer"}</button>}
        </div>
      ) : (
        <div className="row"><button className="btn" type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer les modifications"}</button></div>
      )}
    </form>
  );
}
