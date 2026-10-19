"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const HOME = "/events";
const TAB = "cer-resume"; // sessionStorage : présent tant que l'onglet (ou l'application) reste ouvert
const SEEN = "cer-last-seen"; // localStorage : dernier moment où l'application était visible
const AWAY = 30 * 60 * 1000;
// retour d'un paiement externe : la page doit s'afficher pour confirmer le règlement
const EXEMPT = /^\/events\/[^/]+\/pay\//;

const get = (s: () => Storage, k: string) => { try { return s().getItem(k); } catch { return null; } };
const put = (s: () => Storage, k: string, v: string) => { try { s().setItem(k, v); } catch { /* stockage indisponible */ } };
let checkedThisDocument = false; // une seule vérification par chargement de page, même si le layout se remonte

/**
 * « Mes événements » est la page de reprise : à la réouverture de l'application (nouvel onglet, réouverture,
 * actualisation, ou retour après une longue absence), l'organisateur y est ramené au lieu de la dernière page vue.
 * La navigation normale dans l'application n'est jamais interrompue, ni une saisie en cours.
 */
export function ResumeGuard() {
  const path = usePathname();
  const router = useRouter();
  const current = useRef(path);
  const dirty = useRef(false);
  useEffect(() => { current.current = path; dirty.current = false; }, [path]);

  useEffect(() => {
    const go = () => { const p = current.current; if (p !== HOME && !EXEMPT.test(p)) router.replace(HOME); };
    const now = Date.now();
    const last = Number(get(() => localStorage, SEEN) || 0);
    const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
    const reopened = !checkedThisDocument && (!get(() => sessionStorage, TAB) || nav?.type === "reload" || (last > 0 && now - last > AWAY));
    checkedThisDocument = true;
    put(() => sessionStorage, TAB, "1");
    put(() => localStorage, SEEN, String(now));
    if (reopened) go();

    let hiddenAt = 0;
    const onInput = () => { dirty.current = true; };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); put(() => localStorage, SEEN, String(hiddenAt)); return; }
      if (hiddenAt && Date.now() - hiddenAt > AWAY && !dirty.current) go();
      hiddenAt = 0;
      put(() => localStorage, SEEN, String(Date.now()));
    };
    const onHide = () => put(() => localStorage, SEEN, String(Date.now()));
    document.addEventListener("input", onInput, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [router]);
  return null;
}
