import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadCatalog, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { offersDrinks, offersFood } from "@/lib/format";
import { addItems, renameItem, deleteItem } from "@/app/(org)/events/[id]/drinks/actions";

/** Liste des boissons ou des plats proposés aux invités, avec le nombre de choix déjà faits. */
export async function CatalogPage({ id, kind }: { id: string; kind: "drink" | "dish" }) {
  const me = await requireOrganizer();
  const ev = await loadEvent(id);
  const items = (await loadCatalog(id)).filter((c) => c.kind === kind);
  const sb = await serverClient();
  const { data: orders } = await sb.from("guest_orders").select("drinks, dishes").eq("event_id", id);
  const count = (itemId: string) => (orders || []).reduce((s: number, o: { drinks: string[]; dishes: string[] }) => s + (kind === "drink" ? o.drinks : o.dishes).filter((x) => x === itemId).length, 0);
  const offered = kind === "drink" ? offersDrinks(ev.offer) : offersFood(ev.offer);
  const write = canWrite(ev, me);
  const L = kind === "drink" ? { title: "Boissons", one: "boisson", ph: "Coca-Cola\nFanta\nPrimus" } : { title: "Buffet", one: "plat", ph: "Poulet braisé\nPoisson\nRiz" };
  return (
    <>
      <PageHeader eyebrow="Préparer" title={L.title} sub={`Chaque invité choisit une ${L.one === "plat" ? "assiette" : "boisson"} par personne dans cette liste.`} />
      {!offered && <Notice>Les invités ne choisissent pas de {L.one} pour cet événement. Changez « Ce que les invités choisissent » dans Modifier l’événement pour l’activer.</Notice>}
      {write && (
        <section className="card form" style={{ marginBottom: 16 }}>
          <h2>Ajouter</h2>
          <ActionForm action={addItems} hidden={{ event_id: id, kind }} submit="Ajouter">
            <div className="fld"><label htmlFor="names">Un nom par ligne</label><textarea id="names" name="names" placeholder={L.ph} /></div>
          </ActionForm>
        </section>
      )}
      {!items.length ? <Empty>La liste est vide.</Empty> : (
        <div className="list">
          {items.map((it) => (
            <div key={it.id} className="li">
              {write ? (
                <ActionForm action={renameItem} hidden={{ event_id: id, item_id: it.id }} submit="Renommer">
                  <input className="in" name="name" defaultValue={it.name} maxLength={80} aria-label={`Nom de ${it.name}`} />
                </ActionForm>
              ) : <b>{it.name}</b>}
              <span className="row"><span className="hint">{count(it.id)} choix</span>
                {write && <ConfirmAction action={deleteItem} danger label="Supprimer" title={`Supprimer « ${it.name} » ?`} body="Les invités ne pourront plus le choisir." confirmLabel="Supprimer" hidden={{ event_id: id, item_id: it.id }} />}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
