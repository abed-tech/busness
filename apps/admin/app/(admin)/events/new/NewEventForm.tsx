"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { parseGuests, tableCount, KIND_LABEL } from "@ceremonia/core";
import { createEvent, searchOrganizers } from "../actions";
import { readGuestFile } from "@/lib/client/readGuestFile";
import type { ActionState } from "@/components/ConfirmAction";

const TYPES: Record<string, { label: string; a: string; b?: string; cap: number }> = {
  mariage: { label: "Mariage", a: "Prénom du marié", b: "Prénom de la mariée", cap: 10 },
  fiancailles: { label: "Fiançailles", a: "Prénom du fiancé", b: "Prénom de la fiancée", cap: 10 },
  anniversaire: { label: "Anniversaire", a: "Personne fêtée", cap: 8 },
  bapteme: { label: "Baptême", a: "Prénom de l’enfant", cap: 8 },
  gala: { label: "Gala", a: "Nom du gala", b: "Organisé par (facultatif)", cap: 10 },
  conference: { label: "Conférence", a: "Nom de la conférence", b: "Organisé par (facultatif)", cap: 10 },
};

export function NewEventForm() {
  const [state, run, pending] = useActionState<ActionState, FormData>(createEvent, null);
  const [mode, setMode] = useState<"platform" | "for_organizer">("platform");
  const [type, setType] = useState("mariage");
  const [cap, setCap] = useState(10);
  const [expected, setExpected] = useState(0);
  const [offer, setOffer] = useState("both");
  const [guests, setGuests] = useState("");
  const [fileErr, setFileErr] = useState("");
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState<{ id: string; username: string; email: string | null }[]>([]);
  const [org, setOrg] = useState<{ id: string; username: string } | null>(null);
  const [searching, startSearch] = useTransition();
  const T = TYPES[type];
  const parsed = useMemo(() => (guests.trim() ? parseGuests(guests, "+243") : null), [guests]);
  const persons = parsed ? parsed.rows.reduce((a, r) => a + (r.kind === "couple" ? 2 : 1), 0) : 0;
  const tc = cap > 0 ? tableCount({ table_capacity: cap, expected, extra_tables: 0 }, parsed ? parsed.rows.map((r) => ({ kind: r.kind || null })) : []) : 0;

  return (
    <form action={run} className="form" style={{ maxWidth: 860 }}>
      <section className="card form">
        <h2>Mode de création</h2>
        <div className="choice" role="radiogroup" aria-label="Mode">
          <label><input type="radio" name="mode" value="platform" checked={mode === "platform"} onChange={() => setMode("platform")} /><span><b>Événement de la plateforme</b><small>Géré par l’administration, sans organisateur.</small></span></label>
          <label><input type="radio" name="mode" value="for_organizer" checked={mode === "for_organizer"} onChange={() => setMode("for_organizer")} /><span><b>Pour le compte d’un organisateur</b><small>Associé explicitement à son compte, sans transfert de propriété.</small></span></label>
        </div>
        {mode === "for_organizer" && (
          <div className="form">
            <div className="fld">
              <label htmlFor="orgq">Organisateur concerné</label>
              <div className="row">
                <input id="orgq" className="in" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, e-mail ou téléphone" />
                <button type="button" className="btn ghost" disabled={searching || q.trim().length < 2} onClick={() => startSearch(async () => setOrgs(await searchOrganizers(q)))}>Rechercher</button>
              </div>
              {orgs.length > 0 && !org && (
                <div className="tbl-wrap"><table className="tbl"><tbody>{orgs.map((o) => (
                  <tr key={o.id} className="link" onClick={() => setOrg(o)}><td><b>{o.username}</b> <span className="hint">{o.email}</span></td><td className="r"><button type="button" className="btn sm ghost">Choisir</button></td></tr>
                ))}</tbody></table></div>
              )}
              {org && <div className="notice ok">Associé à <b>{org.username}</b> <button type="button" className="btn sm ghost" onClick={() => setOrg(null)}>Changer</button></div>}
              <input type="hidden" name="organizer_id" value={org?.id || ""} />
            </div>
            <label className="row"><input type="checkbox" name="organizer_can_manage" defaultChecked /> L’organisateur peut gérer cet événement depuis son espace</label>
          </div>
        )}
      </section>

      <section className="card form">
        <h2>Informations</h2>
        <div className="fld"><label htmlFor="type">Type d’événement</label>
          <select id="type" name="type" value={type} onChange={(e) => { setType(e.target.value); setCap(TYPES[e.target.value].cap); }}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="grid g2">
          <div className="fld"><label htmlFor="host_a">{T.a}</label><input id="host_a" name="host_a" maxLength={80} /></div>
          {T.b ? <div className="fld"><label htmlFor="host_b">{T.b}</label><input id="host_b" name="host_b" maxLength={80} /></div> : <input type="hidden" name="host_b" value="" />}
        </div>
        <div className="fld"><label htmlFor="title">Titre affiché</label><input id="title" name="title" required maxLength={160} placeholder="Patrick & Grâce" /></div>
        <div className="grid g2">
          <div className="fld"><label htmlFor="event_date">Date</label><input id="event_date" name="event_date" type="date" required /></div>
          <div className="fld"><label htmlFor="event_time">Heure</label><input id="event_time" name="event_time" type="time" defaultValue="16:00" required /></div>
        </div>
        <div className="fld"><label htmlFor="venue">Lieu</label><input id="venue" name="venue" required maxLength={160} /></div>
        <div className="fld"><label htmlFor="address">Adresse</label><input id="address" name="address" required maxLength={300} /></div>
        <div className="fld"><label htmlFor="dress">Code vestimentaire (facultatif)</label><input id="dress" name="dress" maxLength={160} /></div>
        <div className="fld"><label htmlFor="message">Message aux invités</label><textarea id="message" name="message" maxLength={2000} /></div>
        <div className="fld"><label htmlFor="program">Programme (heure | activité, une ligne chacune)</label><textarea id="program" name="program" maxLength={3000} /></div>
        <input type="hidden" name="phone_prefix" value="+243" />
      </section>

      <section className="card form">
        <h2>Tables</h2>
        <div className="grid g2">
          <div className="fld"><label htmlFor="table_capacity">Places par table</label><input id="table_capacity" name="table_capacity" type="number" min={1} max={100} value={cap} onChange={(e) => setCap(Number(e.target.value))} required /></div>
          <div className="fld"><label htmlFor="expected">Personnes attendues</label><input id="expected" name="expected" type="number" min={0} max={10000} value={expected} onChange={(e) => setExpected(Number(e.target.value))} /></div>
        </div>
        <p className="hint">{tc ? `${tc} table(s) de ${cap} places. Un couple occupe toujours 2 places à la même table.` : "Indiquez les places par table."}</p>
      </section>

      <section className="card form">
        <h2>Boissons et buffet</h2>
        <div className="fld"><label htmlFor="offer">Proposer aux invités</label>
          <select id="offer" name="offer" value={offer} onChange={(e) => setOffer(e.target.value)}>
            <option value="both">Boissons et plats</option><option value="drinks">Boissons uniquement</option><option value="food">Plats uniquement</option><option value="none">Ni boissons ni plats</option>
          </select>
        </div>
        <div className="grid g2">
          {(offer === "both" || offer === "drinks") && <div className="fld"><label htmlFor="drinks">Boissons (une par ligne)</label><textarea id="drinks" name="drinks" placeholder={"Coca\nTurbo King\nNkoyi"} /></div>}
          {(offer === "both" || offer === "food") && <div className="fld"><label htmlFor="dishes">Plats (un par ligne)</label><textarea id="dishes" name="dishes" placeholder={"Poulet\nPoisson"} /></div>}
        </div>
      </section>

      <section className="card form">
        <h2>Invités</h2>
        <p className="hint">Ajoutez une personne par ligne, collez une liste ou importez un fichier Excel (.xlsx) ou CSV. Colonnes possibles : Nom ; Statut ; WhatsApp ; Table.</p>
        <div className="fld"><label htmlFor="guests">Liste</label><textarea id="guests" name="guests" value={guests} onChange={(e) => setGuests(e.target.value)} style={{ minHeight: 160 }} placeholder={"Mr Luc ; Monsieur ; +243 81 000 0001\nCouple Bola ; Couple ; 081 000 0002"} /></div>
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
            {parsed.issues.length > 0 && <div className="hint" style={{ color: "var(--warn)" }}>{parsed.issues.length} remarque(s) : {parsed.issues.slice(0, 2).join(" ")}</div>}
          </div>
        )}
        <label className="row"><input type="checkbox" name="auto" defaultChecked /> Attribuer automatiquement les places après la création</label>
      </section>

      {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="alert">{state.message}</div>}
      <div className="row"><button className="btn" type="submit" disabled={pending || (mode === "for_organizer" && !org)}>{pending ? "Création…" : "Créer l’événement gratuitement"}</button></div>
    </form>
  );
}
