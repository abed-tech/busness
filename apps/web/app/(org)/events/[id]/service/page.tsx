import { requireOrganizer, rpc } from "@/lib/auth";
import { loadEvent } from "@/lib/event";
import { PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ServiceBoard } from "@/components/ServiceBoard";

export default async function Service({ params }: { params: Promise<{ id: string }> }) {
  await requireOrganizer();
  const { id } = await params;
  await loadEvent(id);
  const r = await rpc<{ table: number; kind: string; item: string; qty: number }[]>("service_totals", { p_event: id });
  return (
    <>
      <PageHeader eyebrow="Jour J" title="Service par table" sub="Quantités commandées par les invités qui ont confirmé, table par table. Le personnel de service voit la même page avec son lien, sans aucun nom." />
      <AutoRefresh seconds={10} />
      {r.ok ? <ServiceBoard items={r.data || []} /> : <div className="error-box">{r.message}</div>}
    </>
  );
}
