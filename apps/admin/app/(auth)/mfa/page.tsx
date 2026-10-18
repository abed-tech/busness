import { redirect } from "next/navigation";
import { auth, dataClient } from "@ceremonia/server";
import { currentSession, endSession } from "@/lib/data/server";
import { MfaForm } from "./MfaForm";

/** Second facteur obligatoire (TOTP) : inscription au premier passage, puis vérification à chaque connexion. */
export default async function MfaPage() {
  const s = await currentSession();
  if (!s) redirect("/login");
  const { data: a } = await dataClient({ role: "authenticated", claims: { sub: s.userId } }).from("admin_users").select("active").eq("user_id", s.userId).maybeSingle();
  if (!a?.active) { await endSession(); redirect("/login?e=denied"); }
  if (s.aal === "aal2") redirect("/");
  const verified = await auth.verifiedFactor(s.userId);
  return (
    <main className="auth">
      <div className="card">
        <p className="eyebrow">Sécurité</p>
        <h1 style={{ fontSize: "1.9rem", margin: "6px 0 14px" }}>{verified ? "Code de vérification" : "Activer le second facteur"}</h1>
        <MfaForm factorId={verified} />
      </div>
    </main>
  );
}
