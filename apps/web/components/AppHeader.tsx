"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "./ui";

const I = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  back: <path d="M15 5l-7 7 7 7" />,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};
export const Icon = ({ name }: { name: keyof typeof I }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name]}</svg>
);

/**
 * En-tête fixe commun : trois colonnes de même largeur pour que le nom de l'application reste centré,
 * titre de la page juste en dessous. « home » : menu à gauche ; « page » : retour à gauche, menu à droite.
 */
export function AppHeader({ variant, title, back, right, menuLabel, menu }: {
  variant: "home" | "page"; title: string; back?: string; right?: ReactNode; menuLabel: string; menu: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; btn.current?.focus(); };
  }, [open]);

  const menuBtn = (
    <button ref={btn} type="button" className="iconbtn" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="appmenu" aria-label={menuLabel}>
      <Icon name="menu" />
    </button>
  );
  const side = variant === "home" ? "left" : "right";
  return (
    <>
      <header className="apphead">
        <div className="apphead-l">{variant === "home" ? menuBtn : back ? <Link className="iconbtn" href={back} aria-label="Retour"><Icon name="back" /></Link> : null}</div>
        <Link className="apphead-brand" href="/events" aria-label="Skyevenapp, mes événements"><Logo /></Link>
        <div className="apphead-r">{variant === "home" ? right : menuBtn}</div>
        <p className="apphead-t">{title}</p>
      </header>
      {open && (
        <div className="drawer-bg" onClick={() => setOpen(false)}>
          <div id="appmenu" ref={panel} className={"drawer " + side} role="dialog" aria-modal="true" aria-label={menuLabel}
            onClick={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
            <div className="drawer-top">
              <Logo />
              <button type="button" className="iconbtn" onClick={() => setOpen(false)} aria-label="Fermer le menu"><Icon name="close" /></button>
            </div>
            {menu}
          </div>
        </div>
      )}
    </>
  );
}
