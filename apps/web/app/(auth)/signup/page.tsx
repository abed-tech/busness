import Link from "next/link";
import { Logo } from "@/components/ui";
import { SignupForm } from "../AuthForms";

export default async function Page() {
  
  return (
    <div className="auth">
      <div className="card form">
        <Logo />
        <h1 style={{ fontSize: "1.9rem" }}>Créer un compte organisateur</h1>
        
        <SignupForm />
        <p className="hint"><Link href="/login">J’ai déjà un compte</Link></p>
      </div>
    </div>
  );
}
