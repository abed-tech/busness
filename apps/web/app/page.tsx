import Link from "next/link";
import { Logo } from "@/components/ui";

export default function Home() {
  return (
    <div className="auth">
      <div className="card" style={{ width: "min(520px, 100%)", textAlign: "center", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Logo /></div>
        <h1 style={{ fontSize: "2.4rem" }}>Vos invitations, vos invités, votre jour J.</h1>
        <p className="hint" style={{ fontSize: "1rem" }}>Créez l’événement, envoyez une invitation personnelle sur WhatsApp, recueillez les réponses et les choix de boissons et de plats, placez vos invités à table et accueillez-les avec un QR code.</p>
        <p className="hint">5 $ par tranche de 50 personnes · un couple compte pour deux.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/signup">Créer un compte</Link>
          <Link className="btn ghost" href="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
