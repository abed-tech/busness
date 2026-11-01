"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge les données de la page à intervalle régulier (suivis en direct, confirmation de paiement). */
export function AutoRefresh({ seconds = 5, quiet = false }: { seconds?: number; quiet?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return quiet ? null : <p className="hint" aria-live="polite">Mise à jour automatique toutes les {seconds} secondes.</p>;
}

/** Poursuit automatiquement vers la page suivante (paiement confirmé), après un court délai pour lire la confirmation. */
export function AutoRedirect({ to, seconds = 2 }: { to: string; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(to), seconds * 1000);
    return () => clearTimeout(t);
  }, [router, to, seconds]);
  return null;
}
