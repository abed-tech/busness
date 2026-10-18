"use client";
import { useActionState, useCallback, useEffect, useState } from "react";
import { kLogin, kLogout, kOverview, kLookup, kConfirm, kServe, type KResult } from "./actions";
import { Scanner } from "./Scanner";
import { Logo } from "@/components/ui";
import { hm, plur } from "@/lib/format";

type Res = { tone: "idle" | "ok" | "warn" | "bad"; title: string; sub?: string; table?: number | null; data?: Record<string, any> };
const IDLE_CTL: Res = { tone: "idle", title: "Prêt à scanner", sub: "Scannez le QR code de l’invité." };
const IDLE_SRV: Res = { tone: "idle", title: "Prêt à scanner", sub: "Scannez le QR code de l’invité pour voir sa commande." };

export function StaffApp({ short, staff, initial, expiredMsg }: { short: string; staff: string; initial: Record<string, any> | null; expiredMsg: string }) {
  const [ov, setOv] = useState(initial);
  const [ls, login, logging] = useActionState<KResult | null, FormData>(async (p: KResult | null, fd: FormData) => {
    const r = await kLogin(p, fd);
    if (r.ok) { const o = await kOverview(short, staff); if (o.ok) setOv(o.data!); }
    return r;
  }, null);
  const isCtl = ov?.role === "controller";
  const [res0, setRes] = useState<Res | null>(null);
  const res: Res = res0 || (isCtl ? IDLE_CTL : IDLE_SRV);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const o = await kOverview(short, staff);
    if (o.ok) setOv(o.data!); else if (o.expired) setOv(null);
  }, [short, staff]);
  useEffect(() => { if (!ov) return; const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 10000); return () => clearInterval(t); }, [ov, refresh]);

  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  function fail(r: KResult) {
    if (r.expired) { setOv(null); return; }
    setRes({ tone: "bad", title: "Non enregistré", sub: r.message || (offline ? "Connexion impossible. Rien n’a été enregistré : réessayez." : "Erreur. Réessayez.") });
  }

  async function onScan(code: string) {
    if (busy) return;
    setBusy(true);
    const r = await kLookup(short, staff, code);
    setBusy(false);
    if (!r.ok) { setRes({ tone: "bad", title: "Invitation invalide", sub: r.message }); if (r.expired) setOv(null); return; }
    const d = r.data!;
    if (isCtl) {
      if (d.entered_at) setRes({ tone: "warn", title: d.name, sub: `Déjà validée à ${hm(d.entered_at)}${d.entered_by ? " (" + d.entered_by + ")" : ""} · ${plur(d.persons, "personne")}`, table: d.table });
      else if (d.rsvp !== "yes") setRes({ tone: "bad", title: d.name, sub: d.rsvp === "no" ? "L’invité a décliné l’invitation." : "Présence non confirmée.", table: d.table });
      else setRes({ tone: "ok", title: d.name, sub: `Invitation confirmée · ${plur(d.persons, "personne")}`, table: d.table, data: d });
    } else {
      setRes({ tone: "idle", title: d.name, table: d.table, data: d, sub: d.confirmed ? undefined : "Aucune commande : l’invité n’a pas confirmé sa présence." });
    }
  }

  async function confirm() {
    if (!res.data) return;
    setBusy(true);
    const r = await kConfirm(short, staff, res.data.guest_id);
    setBusy(false);
    if (!r.ok) return fail(r);
    const d = r.data!;
    if (d.status === "confirmed") setRes({ tone: "ok", title: "Entrée confirmée", sub: `${d.name} · ${plur(d.persons, "personne")} · ${hm(d.at)}`, table: d.table });
    else if (d.status === "already") setRes({ tone: "warn", title: "Déjà validée", sub: `${d.name} est entré(e) à ${hm(d.at)}${d.by ? " (" + d.by + ")" : ""}.` });
    else setRes({ tone: "bad", title: "Entrée refusée", sub: d.message });
    refresh();
  }

  async function serve(kind: "drink" | "dish") {
    if (!res.data) return;
    setBusy(true);
    const r = await kServe(short, staff, res.data.guest_id, kind);
    setBusy(false);
    if (!r.ok) return fail(r);
    const d = r.data!;
    const key = kind === "drink" ? "drink_served" : "dish_served";
    setRes({ ...res, data: { ...res.data, [key]: d.status === "nothing" ? null : { at: d.at, by: d.by } }, sub: d.status === "already" ? `Déjà ${kind === "drink" ? "servie" : "servi"} à ${hm(d.at)}${d.by ? " (" + d.by + ")" : ""}.` : d.status === "nothing" ? d.message : undefined });
    refresh();
  }

  const head = (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <Logo />
      {ov && <button className="btn ghost sm" onClick={async () => { await kLogout(short, staff); setOv(null); }}>Se déconnecter</button>}
    </div>
  );

  if (!ov) {
    return (
      <div className="kapp">
        {head}
        <h1 style={{ fontSize: "1.8rem" }}>Accès du personnel</h1>
        <form action={login} className="card form">
          <input type="hidden" name="short" value={short} />
          <input type="hidden" name="staff" value={staff} />
          <p className="hint">{expiredMsg || "Saisissez le code et le mot de passe reçus de l’organisateur."}</p>
          <div className="fld"><label htmlFor="k-c">Code d’accès</label><input id="k-c" name="code" maxLength={8} autoComplete="username" autoCapitalize="characters" spellCheck={false} required /></div>
          <div className="fld"><label htmlFor="k-p">Mot de passe</label><input id="k-p" name="password" type="password" maxLength={64} autoComplete="current-password" required /></div>
          {ls?.message && <div className="notice bad" role="alert">{ls.message}</div>}
          <button className="btn bigbtn" disabled={logging}>{logging ? "Vérification…" : "Se connecter"}</button>
        </form>
      </div>
    );
  }

  const d = res.data;
  return (
    <div className="kapp">
      {head}
      <div><p className="eyebrow">{isCtl ? "Contrôle des entrées" : "Service"} · {ov.name}</p><h1 style={{ fontSize: "1.8rem" }}>{ov.event_title}</h1></div>
      {offline && <div className="notice bad">Hors connexion : aucune validation ne peut être enregistrée.</div>}
      <div className="grid g2">
        {isCtl ? <>
          <div className="card stat"><b>{ov.entered_persons}</b><span>Personnes entrées</span></div>
          <div className="card stat"><b>{ov.expected_persons}</b><span>Attendues</span></div>
        </> : <>
          <div className="card stat"><b>{ov.drinks.served}/{ov.drinks.planned}</b><span>Boissons servies</span></div>
          <div className="card stat"><b>{ov.dishes.served}/{ov.dishes.planned}</b><span>Plats servis</span></div>
        </>}
      </div>

      <div className={"res " + res.tone} role="status" aria-live="polite">
        <b>{res.title}</b>
        {res.sub && <span>{res.sub}</span>}
        {res.table !== undefined && <span className="tbl">{res.table ? `Table ${res.table}` : "Sans table"}</span>}
        {isCtl && res.tone === "ok" && d && !d.entered_at && res.title !== "Entrée confirmée" && <button className="btn bigbtn" disabled={busy} onClick={confirm}>{busy ? "Enregistrement…" : "Confirmer l’entrée"}</button>}
        {!isCtl && d && d.confirmed && (["drink", "dish"] as const).map((k) => {
          const items: string[] = k === "drink" ? d.drinks : d.dishes;
          const sv = k === "drink" ? d.drink_served : d.dish_served;
          if (!items?.length) return <div key={k} className="hint">{k === "drink" ? "Aucune boisson prévue" : "Aucun plat prévu"}</div>;
          return (
            <div key={k} style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span className="eyebrow">{k === "drink" ? "Boissons" : "Plats"}</span>
              <b>{items.join(" · ")}</b>
              {sv ? <span className="badge ok">{k === "drink" ? "Servies" : "Servis"} à {hm(sv.at)}{sv.by ? ` (${sv.by})` : ""}</span>
                : <button className="btn" disabled={busy} onClick={() => serve(k)}>{k === "drink" ? "Boisson servie" : "Plat servi"}</button>}
            </div>
          );
        })}
      </div>

      <Scanner onCode={onScan} busy={busy} />

      {isCtl && ov.recent?.length > 0 && (
        <section><p className="eyebrow" style={{ marginBottom: 6 }}>Dernières entrées</p>
          <div className="list">{ov.recent.map((r: { name: string; persons: number; at: string }, i: number) => <div key={i} className="li"><span>{r.name} · {r.persons}</span><span className="hint">{hm(r.at)}</span></div>)}</div>
        </section>
      )}
    </div>
  );
}
