/**
 * Réseaux mobile money de RDC proposés sur la page de paiement, avec leurs préfixes (après le 0 national).
 * Wonya détecte lui-même l'opérateur à partir du numéro : le réseau choisi sert à guider l'organisateur
 * et à repérer un numéro d'un autre réseau avant d'envoyer la demande. Logos : public/networks/<id>.svg.
 */
export const NETWORKS = [
  { id: "mpesa", label: "M-Pesa", prefixes: ["81", "82", "83"] },
  { id: "airtel", label: "Airtel Money", prefixes: ["97", "98", "99"] },
  { id: "orange", label: "Orange Money", prefixes: ["80", "84", "85", "89"] },
  { id: "africell", label: "Afrimoney", prefixes: ["90", "91"] },
] as const;

export type NetworkId = (typeof NETWORKS)[number]["id"];

/** Numéro mobile RDC : 0XXXXXXXXX ou +243XXXXXXXXX (espaces, points et tirets tolérés). null si invalide. */
export function rdcPhone(v: string): string | null {
  const s = v.replace(/[\s.-]/g, "").replace(/^243/, "+243");
  return /^(?:\+243|0)\d{9}$/.test(s) ? s : null;
}

/** Réseau correspondant au préfixe d'un numéro valide (null : numéro invalide ou préfixe inconnu). */
export function networkOf(phone: string): NetworkId | null {
  const s = rdcPhone(phone);
  if (!s) return null;
  const p = s.replace(/^\+243|^0/, "").slice(0, 2);
  return NETWORKS.find((n) => (n.prefixes as readonly string[]).includes(p))?.id ?? null;
}

export const networkLabel = (id: string | null) => NETWORKS.find((n) => n.id === id)?.label ?? null;
