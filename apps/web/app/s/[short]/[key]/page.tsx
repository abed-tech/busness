import { anonClient } from "@/lib/data/server";
import { ServiceBoard } from "@/components/ServiceBoard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service · Cérémonia", robots: { index: false, follow: false } };

/** Page du personnel de service : accès par lien secret, quantités par table uniquement. */
export default async function ServiceLink({ params }: { params: Promise<{ short: string; key: string }> }) {
  const { short, key } = await params;
  const sb = await anonClient();
  const { data } = await sb.rpc("service_board", { p_short: short.slice(0, 20), p_key: key.slice(0, 40) });
  if (!data) return <div className="auth"><div className="card form"><Logo /><h1 style={{ fontSize: "1.6rem" }}>Lien indisponible</h1><p className="hint">Ce lien a été remplacé ou l’événement n’est plus disponible. Demandez le nouveau lien à l’organisateur.</p></div></div>;
  return (
    <main className="org-main">
      <Logo />
      <h1 style={{ margin: "14px 0 6px" }}>{data.title}</h1>
      <p className="hint" style={{ marginBottom: 14 }}>Commandes par table · aucun nom d’invité n’est affiché.</p>
      <AutoRefresh seconds={15} />
      <ServiceBoard items={data.items} />
    </main>
  );
}
