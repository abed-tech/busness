"use client";
import { useActionState, useState } from "react";
import { createStaff, createStaffList, type CreatedState, type CreatedListState } from "@/app/(org)/events/[id]/staff/actions";
import { parseStaff, STAFF_LIST_MAX } from "@/lib/staff";
import { readGuestFile } from "@/lib/client/readGuestFile";

const wa = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;
type Created = { id: string; code: string; name: string; password: string };
type Common = { eventId: string; role: string; label: string; linkBase: string; eventTitle: string };

/** Code, mot de passe et les trois messages à envoyer pour un accès qui vient d'être créé. */
function StaffCredentials({ c, label, linkBase, eventTitle }: { c: Created; label: string; linkBase: string; eventTitle: string }) {
  const link = linkBase + c.id;
  return (
    <>
      <div className="codebox"><span>Code</span><b>{c.code}</b></div>
      <div className="codebox"><span>Mot de passe</span><b>{c.password}</b></div>
      <div className="row">
        <a className="btn" href={wa(`${label} pour « ${eventTitle} » : ouvrez ce lien le jour J ${link}`)} target="_blank" rel="noopener noreferrer">1. Envoyer le lien</a>
        <a className="btn" href={wa(`Code d’accès : ${c.code}`)} target="_blank" rel="noopener noreferrer">2. Envoyer le code</a>
        <a className="btn" href={wa(`Mot de passe : ${c.password}`)} target="_blank" rel="noopener noreferrer">3. Envoyer le mot de passe</a>
      </div>
    </>
  );
}

/** Création d'un accès : le code et le mot de passe sont affichés une seule fois, à transmettre en trois messages séparés. */
export function StaffCreate({ eventId, role, label, placeholder, linkBase, eventTitle }: Common & { placeholder: string }) {
  const [s, run, pending] = useActionState<CreatedState, FormData>(createStaff, null);
  const [closed, setClosed] = useState<string | null>(null);
  const c = s?.created && s.created.id !== closed ? s.created : null;
  if (c) {
    return (
      <section className="card form">
        <h2>Accès créé : {c.name}</h2>
        <StaffCredentials c={c} label={label} linkBase={linkBase} eventTitle={eventTitle} />
        <p className="hint">Envoyez ces trois éléments dans trois messages séparés. Le mot de passe ne sera plus jamais affiché.</p>
        <div><button className="btn ghost" onClick={() => setClosed(c.id)}>Terminé</button></div>
      </section>
    );
  }
  return (
    <section className="card form">
      <h2>Nouveau {label.toLowerCase()}</h2>
      <form action={run} className="form">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="role" value={role} />
        <div className="grid g2">
          <div className="fld"><label htmlFor="st-n">Nom</label><input id="st-n" name="name" maxLength={60} required placeholder={placeholder} autoComplete="off" /></div>
          <div className="fld"><label htmlFor="st-p">Mot de passe initial</label><input id="st-p" name="password" type="text" minLength={6} maxLength={64} required placeholder="6 caractères minimum" autoComplete="new-password" spellCheck={false} /></div>
        </div>
        <p className="hint">Le mot de passe est haché (bcrypt) avant d’être enregistré. Un code d’accès est généré automatiquement.</p>
        {s?.ok === false && <div className="notice bad" role="alert">{s.message}</div>}
        <div><button className="btn" disabled={pending}>{pending ? "Création…" : "Créer l’accès"}</button></div>
      </form>
    </section>
  );
}

/** Création en lot depuis une liste collée ou un fichier : « Nom ; Mot de passe » par ligne, mot de passe facultatif. */
export function StaffListAdd({ eventId, role, label, linkBase, eventTitle, mode }: Common & { mode: "file" | "paste" }) {
  const [list, setList] = useState("");
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [s, run, pending] = useActionState<CreatedListState, FormData>(async (p: CreatedListState, fd: FormData) => { const r = await createStaffList(p, fd); if (r?.created?.length) { setList(""); setFileName(""); setDone(false); } return r; }, null);
  const p = list.trim() ? parseStaff(list) : null;
  if (s?.created?.length && !done) {
    return (
      <section className="card form">
        <h2>{s.created.length} accès créé(s)</h2>
        {s.message && <div className={"notice " + (s.message.includes("Échec") ? "bad" : "ok")} role="status">{s.message}</div>}
        <p className="hint">Envoyez à chaque personne ses trois éléments dans trois messages séparés. Les mots de passe ne seront plus jamais affichés.</p>
        {s.created.map((c) => (
          <div key={c.id} className="form" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <b>{c.name}</b>
            <StaffCredentials c={c} label={label} linkBase={linkBase} eventTitle={eventTitle} />
          </div>
        ))}
        <div><button className="btn ghost" onClick={() => setDone(true)}>Terminé</button></div>
      </section>
    );
  }
  return (
    <section className="card form">
      <h2 style={{ margin: 0 }}>{mode === "file" ? "Importer une liste" : "Coller une liste"}</h2>
      <form action={run} className="form" key={mode}>
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="role" value={role} />
        {mode === "file" && (
          <div className="row">
            <label className="btn ghost" style={{ position: "relative" }}>{fileName ? "Choisir un autre fichier" : "Choisir un fichier Excel (.xlsx) ou CSV"}
              <input type="file" accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setErr(""); try { setList(await readGuestFile(f)); setFileName(f.name); } catch (x) { setErr((x as Error).message); } }} />
            </label>
            {fileName && <span className="hint">{fileName}</span>}
          </div>
        )}
        {err && <div className="notice bad">{err}</div>}
        {(mode === "paste" || list) && <div className="fld"><label htmlFor="sl-l">{mode === "paste" ? "Une personne par ligne : Nom ; Mot de passe (facultatif)" : "Contenu lu dans le fichier (modifiable)"}</label><textarea id="sl-l" name="list" value={list} onChange={(e) => setList(e.target.value)} style={{ minHeight: 160 }} placeholder={"Jean, entrée principale ; motdepasse1\nMarie, entrée VIP"} spellCheck={false} /></div>}
        <p className="hint">Colonne 1 : nom. Colonne 2 : mot de passe initial (6 à 64 caractères) ; s’il manque, un mot de passe est généré. Un code d’accès est créé pour chacun. {STAFF_LIST_MAX} personnes au maximum par envoi.</p>
        {p && (
          <div className={"notice " + (p.rows.length ? "ok" : "bad")}>
            <b>{p.rows.length} {label.toLowerCase()}(s) reconnu(s)</b>
            {p.rows.slice(0, 5).map((r, i) => <div key={i} className="hint">{r.name}{r.password ? "" : " · mot de passe généré"}</div>)}
            {p.issues.length > 0 && <div className="hint" style={{ color: "var(--warn)" }}>{p.issues.slice(0, 3).join(" ")}</div>}
          </div>
        )}
        {s?.ok === false && <div className="notice bad" role="alert">{s.message}</div>}
        <div><button className="btn" disabled={pending || !p?.rows.length || p.rows.length > STAFF_LIST_MAX}>{pending ? "Création…" : `Créer ${p?.rows.length || ""} accès`}</button></div>
      </form>
    </section>
  );
}
