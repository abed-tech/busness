"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";

/**
 * En-tête d'un événement en cours de création (brouillon non payé) : seulement les étapes de la création.
 * Les fonctions de gestion (invités, tables, envoi, jour J…) s'ouvrent après le paiement.
 */
export function DraftNav({ id, title, logout }: { id: string; title: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const base = `/events/${id}`;
  const page = path.startsWith(base + "/pay") ? "Paiement" : path.startsWith(base + "/photos") ? "Vos photos" : "Nouvel événement";
  const menu = (
    <nav className="navlist" aria-label="Menu de la création">
      <p className="navlist-ev">{title}</p>
      <span className="grp">Création · non payé</span>
      <Link href={`${base}/draft`} aria-current={path === `${base}/draft` ? "page" : undefined}>Modifier les informations</Link>
      <Link href={`${base}/photos?new=1`} aria-current={path === `${base}/photos` ? "page" : undefined}>Vos photos</Link>
      <a href={`/preview/${id}`}>Aperçu de l’invitation</a>
      <span className="grp">Compte</span>
      <Link href="/events">Mes événements</Link>
      <form action={logout}><button className="navbtn" type="submit">Se déconnecter</button></form>
    </nav>
  );
  return <AppHeader variant="page" title={page} back="/events" menuLabel="Menu de la création" menu={menu} />;
}
