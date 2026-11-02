"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const HOME = "/events";
const PING_EVERY = 60_000; // au plus une activité signalée par minute
const IDLE = 30 * 60_000; // après 30 min sans interaction : vérification auprès du serveur (session fermée ?)
const REFRESH_AFTER = 15_000; // retour sur l'onglet après 15 s : données relues
const RETURN = 10 * 60_000;
// retour d'un paiement externe : la page doit s'afficher pour confirmer le règlement
const EXEMPT = /^\/events\/[^/]+\/pay\//;
const TAB = "cer-tab"; // sessionStorage : absent au premier affichage après la réouverture du navigateur
const POS = "cer-pos"; // localStorage : position de défilement de la dernière page vue

const get = (s: () => Storage, k: string) => { try { return s().getItem(k); } catch { return null; } };
const put = (s: () => Storage, k: string, v: string) => { try { s().setItem(k, v); } catch { /* stockage indisponible */ } };
const here = () => location.pathname + location.search;

/**
 * Activité réelle de l'organisateur sur une page ouverte. Le serveur mesure les délais et décide (api/session) :
 * moins de 10 min d'absence → la page reste, données relues ; 10 à 30 min → « Mes événements » ; 30 min ou plus →
 * connexion. Une actualisation garde la page (le serveur applique les mêmes règles à la requête).
 * Une saisie en cours n'est jamais abandonnée pour « Mes événements » ; le formulaire d'événement est en plus
 * gardé dans le navigateur (EventForm), même si la connexion est redemandée.
 */
export function SessionGuard() {
  const path = usePathname();
  const router = useRouter();
  const current = useRef(path);
  const dirty = useRef(false);
  useEffect(() => { current.current = path; dirty.current = false; }, [path]);

  useEffect(() => {
    let lastPing = Date.now(); // la page vient d'être servie : le serveur a enregistré l'activité
    let lastActivity = Date.now();
    let hiddenAt = 0;
    let busy = false;

    async function report(kind: "activity" | "check", refresh: boolean) {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, path: here() }), cache: "no-store" });
        const d = (await r.json().catch(() => null)) as { action?: string } | null;
        if (d?.action === "login") { location.replace("/auth/idle"); return; }
        if (d?.action === "events" && !dirty.current && current.current !== HOME && !EXEMPT.test(current.current)) { router.replace(HOME); return; }
        if (refresh || d?.action === "events") router.refresh();
      } catch { /* hors ligne : le serveur appliquera les règles à la prochaine requête */ }
      finally { busy = false; }
    }

    // réouverture du navigateur sur la même page (moins de 10 min) : même position de défilement
    const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!get(() => sessionStorage, TAB) && nav?.type === "navigate") {
      try {
        const p = JSON.parse(get(() => localStorage, POS) || "null") as { p: string; y: number; t: number } | null;
        if (p && p.p === here() && Date.now() - p.t < RETURN) requestAnimationFrame(() => window.scrollTo(0, p.y));
      } catch { /* position illisible : ignorée */ }
    }
    put(() => sessionStorage, TAB, "1");

    let posTimer = 0;
    const savePos = () => put(() => localStorage, POS, JSON.stringify({ p: here(), y: Math.round(window.scrollY), t: Date.now() }));
    const onActivity = () => {
      lastActivity = Date.now();
      if (document.visibilityState === "visible" && Date.now() - lastPing >= PING_EVERY) { lastPing = Date.now(); void report("activity", false); }
    };
    const onScroll = () => { onActivity(); clearTimeout(posTimer); posTimer = window.setTimeout(savePos, 400); };
    const onInput = () => { dirty.current = true; onActivity(); };
    const onSubmit = () => { dirty.current = false; };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); savePos(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      lastActivity = Date.now();
      if (away < REFRESH_AFTER && Date.now() - lastPing < PING_EVERY) return;
      lastPing = Date.now();
      void report("activity", away >= REFRESH_AFTER);
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { lastPing = lastActivity = Date.now(); void report("activity", true); } };
    const timer = window.setInterval(() => { if (Date.now() - lastActivity >= IDLE) void report("check", false); }, PING_EVERY);

    const opts = { capture: true, passive: true };
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"]) document.addEventListener(ev, onActivity, opts);
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", savePos);
    window.addEventListener("pageshow", onShow);
    return () => {
      for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"]) document.removeEventListener(ev, onActivity, opts);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", savePos);
      window.removeEventListener("pageshow", onShow);
      window.clearInterval(timer);
      clearTimeout(posTimer);
    };
  }, [router]);
  return null;
}
