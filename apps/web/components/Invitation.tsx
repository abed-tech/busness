import QRCode from "qrcode";
import { salutation, type GuestKind } from "@ceremonia/core";
import type { InvitationData } from "@/lib/invitation";
import { photoUrl } from "@/lib/event";
import { date, longDate, TYPES } from "@/lib/format";
import { RsvpForm } from "./RsvpForm";
import { InvitationBook, type BookPage } from "./InvitationBook";

const initial = (s: string | null | undefined) => (Array.from((s || "").trim())[0] || "").toUpperCase();

/** Invitation personnelle : la même vue sert à l'invité et à l'aperçu de l'organisateur (sans réponse possible). */
export async function Invitation({ data, token, preview }: { data: InvitationData; token?: string; preview?: boolean }) {
  const { event: e, guest: g } = data;
  const qr = await QRCode.toString(g.qr, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const couple = e.type === "mariage" || e.type === "fiancailles";
  const hosts = couple ? [e.host_a, e.host_b].map((s) => (s || "").trim()).filter(Boolean) : [];
  const names = hosts.join(" & ") || e.title;
  const initials = (hosts.length ? hosts : [e.title]).map(initial).filter(Boolean);
  const label = TYPES[e.type]?.label || "Invitation";
  const prog = e.program.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter((p) => p[0]);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.venue + ", " + e.address)}`;
  const photos = (e.photos || []).map(photoUrl);
  const band = (src: string | undefined) => src && <div className="leaf-photo"><img src={src} alt="" loading="lazy" /></div>;

  const pages: BookPage[] = [
    {
      key: "hero", title: names, tone: "photo",
      node: (
        <div className="hero">
          {photos[0] ? <img className="hero-img" src={photos[0]} alt={names} /> : <div className="hero-img hero-empty" />}
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-txt">
            {couple && <p className="hero-lead">L’amour c’est la suite</p>}
            <h1 className={"hero-names" + (names.length > 24 ? " long" : "")}>
              {hosts.length === 2 ? <>{hosts[0]}<span className="amp">&amp;</span>{hosts[1]}</> : names}
            </h1>
            <p className="hero-date">{date(e.date)}</p>
          </div>
        </div>
      ),
    },
    {
      key: "message", title: "Invitation", tone: "paper",
      node: (
        <>
          {band(photos[1])}
          <div className="paper-in">
            <p className="leaf-eyebrow">{label}</p>
            <p className="leaf-script">{names}</p>
            <span className="rule" aria-hidden="true" />
            <p className="leaf-salut">{salutation({ name: g.name, kind: (g.kind as GuestKind | null) || null })}</p>
            <p className="leaf-text">{e.message || "Vous êtes cordialement invité(e)."}</p>
          </div>
        </>
      ),
    },
    {
      key: "when", title: "Quand et où", tone: "paper",
      node: (
        <>
          {band(photos[2])}
          <div className="paper-in">
            <p className="leaf-eyebrow">Quand et où</p>
            <h2 className="cap">{longDate(e.date)}</h2>
            <p className="leaf-time">{e.time.slice(0, 5)}</p>
            <span className="rule" aria-hidden="true" />
            <p className="leaf-text"><b className="venue">{e.venue}</b><br />{e.address}</p>
            {e.dress && <p className="hint">Tenue : {e.dress}</p>}
            <a className="leaf-link" href={maps} target="_blank" rel="noopener noreferrer">Voir l’itinéraire</a>
          </div>
        </>
      ),
    },
  ];
  if (prog.length > 0) pages.push({
    key: "prog", title: "Programme", tone: "paper",
    node: (
      <div className="paper-in">
        <p className="leaf-eyebrow">Le déroulé</p>
        <h2>Programme</h2>
        <span className="rule" aria-hidden="true" />
        <div className="prog">{prog.map((p, i) => <div key={i}>{p[1] !== undefined ? <><b>{p[0]}</b><span>{p[1]}</span></> : <span style={{ gridColumn: "1 / -1" }}>{p[0]}</span>}</div>)}</div>
      </div>
    ),
  });
  pages.push({
    key: "rsvp", title: "Votre réponse", tone: "paper",
    node: (
      <div className="paper-in">
        <p className="leaf-eyebrow">Répondez s’il vous plaît</p>
        <h2>Votre réponse</h2>
        <span className="rule" aria-hidden="true" />
        <div className="leaf-form">
          <RsvpForm token={token || ""} preview={!!preview} seats={g.seats} offer={e.offer} catalog={data.catalog} current={{ rsvp: g.rsvp, drinks: data.order?.drinks || [], dishes: data.order?.dishes || [] }} locked={!!g.entered_at} />
        </div>
      </div>
    ),
  });
  if (g.rsvp === "yes") pages.push({
    key: "access", title: "Votre accès", tone: "paper",
    node: (
      <div className="paper-in">
        <p className="leaf-eyebrow">À présenter à l’entrée</p>
        <h2>Votre accès</h2>
        <span className="rule" aria-hidden="true" />
        <p className="hint">Présentez ce QR code à l’entrée{g.seats > 1 ? " : il est valable pour vous deux" : ""}.</p>
        <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="leaf-text">Code : <b style={{ letterSpacing: ".15em" }}>{g.code}</b>{g.table ? <> · Table <b>{g.table}</b></> : null}</p>
        {g.entered_at && <p className="badge ok">Entrée validée</p>}
      </div>
    ),
  });
  const last = pages[pages.length - 1];
  last.node = <>{last.node}<p className="leaf-brand">Skyevenapp</p></>;

  return (
    <div className="inv">
      <InvitationBook label={label} initials={initials} guest={g.name} pages={pages} />
    </div>
  );
}
