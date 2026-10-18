"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge les données de la page à intervalle régulier (suivis en direct, confirmation de paiement). */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <p className="hint" aria-live="polite">Mise à jour automatique toutes les {seconds} secondes.</p>;
}
