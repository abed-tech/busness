import QRCode from "qrcode";
import type { InvitationData } from "@/lib/invitation";
import { photoUrl } from "@/lib/event";
import { longDate, TYPES } from "@/lib/format";
import { RsvpForm } from "./RsvpForm";

/** Invitation personnelle : la même vue sert à l'invité et à l'aperçu de l'organisateur (sans réponse possible). */
export async function Invitation({ data, token, preview }: { data: InvitationData; token?: string; preview?: boolean }) {
  const { event: e, guest: g } = data;
  const qr = await QRCode.toString(g.qr, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const names = e.type === "mariage" || e.type === "fiancailles" ? [e.host_a, e.host_b].filter(Boolean).join(" & ") || e.title : e.title;
  const prog = e.program.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter((p) => p[0]);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.venue + ", " + e.address)}`;
  return (
    <div className="inv">
      {e.photos?.length > 0 && <div className="inv-bg" aria-hidden="true">{e.photos.map((p, i) => <i key={p} style={{ backgroundImage: `url("${photoUrl(p)}")`, animationDelay: `${i * (24 / e.photos.length)}s`, animationDuration: `${Math.max(e.photos.length, 1) * 6}s` }} />)}</div>}
      <div className="inv-card">
        {preview && <div className="notice">Aperçu de l’organisateur : l’invité verra exactement cette page. Les réponses sont désactivées ici.</div>}
        <p className="orn">{TYPES[e.type]?.label || "Invitation"}</p>
        <h1 className="names">{names}</h1>
        <p style={{ color: "#e8dcc0" }}>{g.name}, {e.message || "vous êtes cordialement invité(e)."}</p>
        <section className="inv-panel">
          <h2>Quand et où</h2>
          <p style={{ textTransform: "capitalize" }}>{longDate(e.date)} · {e.time.slice(0, 5)}</p>
          <p><b>{e.venue}</b><br />{e.address}</p>
          {e.dress && <p className="hint">Tenue : {e.dress}</p>}
          <a className="btn ghost sm" href={maps} target="_blank" rel="noopener noreferrer">Voir l’itinéraire</a>
        </section>
        {prog.length > 0 && (
          <section className="inv-panel">
            <h2>Programme</h2>
            <div className="prog">{prog.map((p, i) => <div key={i}>{p[1] !== undefined ? <><b>{p[0]}</b><span>{p[1]}</span></> : <span style={{ gridColumn: "1 / -1" }}>{p[0]}</span>}</div>)}</div>
          </section>
        )}
        <section className="inv-panel">
          <h2>Votre réponse</h2>
          <RsvpForm token={token || ""} preview={!!preview} seats={g.seats} offer={e.offer} catalog={data.catalog} current={{ rsvp: g.rsvp, drinks: data.order?.drinks || [], dishes: data.order?.dishes || [] }} locked={!!g.entered_at} />
        </section>
        {g.rsvp === "yes" && (
          <section className="inv-panel" style={{ textAlign: "center" }}>
            <h2>Votre accès</h2>
            <p className="hint">Présentez ce QR code à l’entrée{g.seats > 1 ? " : il est valable pour vous deux" : ""}.</p>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <p style={{ marginTop: 10 }}>Code : <b style={{ letterSpacing: ".15em" }}>{g.code}</b>{g.table ? <> · Table <b>{g.table}</b></> : null}</p>
            {g.entered_at && <p className="badge ok">Entrée validée</p>}
          </section>
        )}
        <p className="hint" style={{ color: "#9aa3b6" }}>Cérémonia</p>
      </div>
    </div>
  );
}
