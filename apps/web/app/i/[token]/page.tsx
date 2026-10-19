import { anonClient } from "@/lib/data/server";
import { Invitation } from "@/components/Invitation";
import type { InvitationData } from "@/lib/invitation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre invitation · Cérémonia", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#F5EFE5", viewportFit: "cover" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await anonClient();
  const { data } = /^[A-Za-z0-9_-]{10,64}$/.test(token) ? await sb.rpc("get_invitation", { p_token: token }) : { data: null };
  if (!data) {
    return (
      <div className="auth"><div className="card form" style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.8rem" }}>Invitation indisponible</h1>
        <p className="hint">Ce lien n’est pas valide ou l’invitation n’est pas encore ouverte. Contactez la personne qui vous a invité(e).</p>
      </div></div>
    );
  }
  return <Invitation data={data as InvitationData} token={token} />;
}
