import Link from "next/link";
import { Logo } from "@/components/ui";
import { LoginForm } from "../AuthForms";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; e?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <div className="card form">
        <Logo />
        <h1 style={{ fontSize: "1.9rem" }}>Connexion</h1>
        {sp.e === "admin" && <div className="notice bad">Ce compte ne peut pas se connecter ici.</div>}
        {sp.e === "link" && <div className="notice bad">Lien invalide ou expiré. Reconnectez-vous ou demandez un nouveau lien.</div>}
        <LoginForm next={sp.next} />
        <p className="hint"><Link href="/signup">Créer un compte</Link> · <Link href="/forgot">Mot de passe oublié</Link></p>
      </div>
    </div>
  );
}
