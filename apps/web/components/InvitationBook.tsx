"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";

export type BookPage = { key: string; title: string; tone: "photo" | "paper"; node: ReactNode };

/** Habillage visuel de l'invitation : couverture au sceau puis pages feuilletées. Aucune donnée ni logique métier ici. */
export function InvitationBook({ label, initials, guest, pages }: { label: string; initials: string[]; guest: string; pages: BookPage[] }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [i, setI] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = pages.length;
  const go = useCallback((k: number) => setI(Math.max(0, Math.min(n - 1, k))), [n]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement | null)?.closest?.("input, select, textarea")) return;
      if (ev.key === "ArrowRight") go(i + 1);
      else if (ev.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, i, go]);

  function openSeal() {
    if (open) return;
    setOpen(true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => { setGone(true); stage.current?.focus({ preventScroll: true }); }, reduce ? 0 : 1000);
  }
  const onStart = (ev: TouchEvent) => {
    const t = ev.target as HTMLElement;
    touch.current = t.closest("input, select, textarea, button, a") ? null : { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  };
  const onEnd = (ev: TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const dx = ev.changedTouches[0].clientX - s.x, dy = ev.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1));
  };

  return (
    <div className={"book" + (open ? " is-open" : "")} data-tone={pages[i]?.tone}>
      <div className="book-stage" ref={stage} tabIndex={-1} inert={!open} onTouchStart={onStart} onTouchEnd={onEnd} aria-roledescription="carrousel" aria-label="Invitation">
        {pages.map((p, k) => (
          <section key={p.key} className={"leaf " + p.tone + (k === i ? " on" : k < i ? " before" : "")} inert={k !== i} aria-hidden={k !== i} aria-roledescription="page" aria-label={`${k + 1} sur ${n} : ${p.title}`}>
            {p.node}
          </section>
        ))}
      </div>
      {open && n > 1 && (
        <nav className="book-nav" aria-label="Pages de l’invitation">
          <button type="button" className="book-arrow" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Page précédente">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5 7.5 12l7 7" /></svg>
          </button>
          <div className="book-dots">
            {pages.map((p, k) => <button key={p.key} type="button" aria-label={p.title} aria-current={k === i ? "page" : undefined} onClick={() => go(k)} />)}
          </div>
          <button type="button" className="book-arrow" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Page suivante">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg>
          </button>
        </nav>
      )}
      {!gone && (
        <div className="cover" aria-hidden={open}>
          <p className="cover-top">{label}</p>
          <div className="cover-mid">
            <button type="button" className="seal" onClick={openSeal} aria-label="Ouvrir l’invitation">
              <span className="seal-ring" aria-hidden="true">
                {initials.length > 1 ? <>{initials[0]}<i>&amp;</i>{initials[1]}</> : initials[0]}
              </span>
            </button>
            <p className="cover-to">{guest}</p>
          </div>
          <p className="cover-hint" aria-hidden="true">Touchez le sceau</p>
        </div>
      )}
    </div>
  );
}
