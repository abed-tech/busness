import Link from "next/link";
import { Logo } from "@/components/ui";
import { ForgotForm } from "../AuthForms";

export default async function Page() {
  
  return (
    <div className="auth">
      <div className="card form">
        <Logo />
        <h1 style={{ fontSize: "1.9rem" }}>Mot de passe oublié</h1>
        
        <ForgotForm />
        <p className="hint"><Link href="/login">Retour à la connexion</Link></p>
      </div>
    </div>
  );
}
