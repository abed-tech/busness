import Link from "next/link";
import { Logo } from "@/components/ui";
import { resumeOrLogin } from "@/lib/data/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  // session vérifiée en base (pas seulement la présence du cookie) : retour à la dernière page ou à « Mes événements » ;
  // session fermée après 30 min d'inactivité : connexion exigée
  await resumeOrLogin("login");
  return (
    <div className="auth">
      <div className="card" style={{ width: "min(520px, 100%)", textAlign: "center", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Logo /></div>
        <h1 style={{ fontSize: "2.4rem" }}>Vos invitations, vos invités, votre jour J.</h1>
        <p className="hint" style={{ fontSize: "1rem" }}>Créez l’événement, envoyez une invitation personnelle sur WhatsApp, recueillez les réponses et les choix de boissons et de plats, placez vos invités à table et accueillez-les avec un QR code.</p>
        <p className="hint">20 $ par événement, payés une seule fois · invités et invitations illimités · toutes les fonctionnalités incluses.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/signup">Créer un compte</Link>
          <Link className="btn ghost" href="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
