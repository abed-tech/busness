import Link from "next/link";
import { Logo } from "@/components/ui";
import { ResetForm } from "../AuthForms";

/** Lien reçu par e-mail : /reset?token=… (valable 1 heure, une seule fois). */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(token);
  return (
    <div className="auth">
      <div className="card form">
        <Logo />
        <h1 style={{ fontSize: "1.9rem" }}>Nouveau mot de passe</h1>
        {valid ? <ResetForm token={token} /> : <div className="notice bad">Lien invalide ou incomplet. Recommencez depuis « Mot de passe oublié ».</div>}
        <p className="hint"><Link href="/login">Retour à la connexion</Link></p>
      </div>
    </div>
  );
}
