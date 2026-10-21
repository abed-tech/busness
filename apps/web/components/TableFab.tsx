import Link from "next/link";

/**
 * Bouton d'action flottant de la page des tables : ouvre le choix « Placer les invités » / « Permuter les invités ».
 * Icône « flèches aller-retour » : dessin ArrowLeftRight de Lucide (licence ISC), intégré en SVG car le projet
 * n'embarque pas de bibliothèque d'icônes (toutes ses icônes sont des SVG en ligne).
 */
export function TableFab({ href }: { href: string }) {
  return (
    <Link href={href} className="fab" aria-label="Placer ou permuter les invités" title="Placer ou permuter les invités">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />
      </svg>
    </Link>
  );
}
