import { redirect } from "next/navigation";
import { serverClient } from "@/lib/data/server";
import { Logo } from "@/components/ui";
import { OnboardingForm } from "./OnboardingForm";

export default async function Onboarding() {
  const sb = await serverClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/login");
  const { data: p } = await sb.from("profiles").select("id").eq("id", u.user.id).maybeSingle();
  if (p) redirect("/events");
  const meta = (u.user.user_metadata || {}) as { username?: string; phone?: string };
  return (
    <div className="auth">
      <div className="card form">
        <Logo />
        <h1 style={{ fontSize: "1.9rem" }}>Votre profil</h1>
        <p className="hint">Ces informations restent privées ; elles permettent à l’équipe Skyevenapp de vous contacter si besoin.</p>
        <OnboardingForm username={meta.username || ""} phone={meta.phone || ""} />
      </div>
    </div>
  );
}
