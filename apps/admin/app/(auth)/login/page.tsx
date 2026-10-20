import { LoginForm } from "./LoginForm";

const MSG: Record<string, string> = {
  denied: "Ce compte n’a pas accès à l’administration.",
  idle: "Vous avez été déconnecté après une période d’inactivité.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="auth">
      <div className="card">
        <p className="eyebrow">Skyevenapp</p>
        <h1 style={{ fontSize: "2rem", margin: "6px 0 18px" }}>Administration</h1>
        {e && MSG[e] && <div className="notice" role="status" style={{ marginBottom: 14 }}>{MSG[e]}</div>}
        <LoginForm />
        <p className="hint" style={{ marginTop: 16 }}>Accès réservé à l’équipe Skyevenapp. Un second facteur (application d’authentification) est exigé.</p>
      </div>
    </main>
  );
}
