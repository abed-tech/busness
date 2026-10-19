import { requireOrganizer } from "@/lib/auth";
import { loadEvent, loadCatalog, canWrite } from "@/lib/event";
import { serverClient } from "@/lib/data/server";
import { PageHeader, Empty, Notice } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { SearchAdd, AddModes, isAddMode } from "@/components/SearchAdd";
import { CatalogAdd } from "@/components/CatalogAdd";
import { offersDrinks, offersFood } from "@/lib/format";
import { renameItem, deleteItem } from "@/app/(org)/events/[id]/drinks/actions";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Liste des boissons ou des plats proposés aux invités, avec le nombre de choix déjà faits. */
export async function CatalogPage({ id, kind, q }: { id: string; kind: "drink" | "dish"; q?: string }) {
  const me = await requireOrganizer();
  const ev = await loadEvent(id);
  const items = (await loadCatalog(id)).filter((c) => c.kind === kind);
  const sb = await serverClient();
  const { data: orders } = await sb.from("guest_orders").select("drinks, dishes").eq("event_id", id);
  const count = (itemId: string) => (orders || []).reduce((s: number, o: { drinks: string[]; dishes: string[] }) => s + (kind === "drink" ? o.drinks : o.dishes).filter((x) => x === itemId).length, 0);
  const offered = kind === "drink" ? offersDrinks(ev.offer) : offersFood(ev.offer);
  const write = canWrite(ev, me);
  const L = kind === "drink" ? { title: "Boissons", one: "boisson", path: "drinks" } : { title: "Plats", one: "plat", path: "buffet" };
  const f = fold(q || "");
  const shown = f ? items.filter((it) => fold(it.name).includes(f)) : items;
  return (
    <>
      <PageHeader eyebrow="Préparer" title={L.title} sub={`Chaque invité choisit une ${L.one === "plat" ? "assiette" : "boisson"} par personne dans cette liste.`} />
      {!offered && <Notice>Les invités ne choisissent pas de {L.one} pour cet événement. Changez « Ce que les invités choisissent » dans Modifier l’événement pour l’activer.</Notice>}
      <SearchAdd q={q} placeholder={`Rechercher un${L.one === "boisson" ? "e boisson" : " plat"}`} addHref={write ? `/events/${id}/${L.path}/new` : undefined} addLabel={`Ajouter des ${L.title.toLowerCase()}`} />
      {!items.length ? <Empty>La liste est vide.{write && <> Touchez « + » pour l’alimenter.</>}</Empty> : !shown.length ? <Empty>Aucun élément ne correspond.</Empty> : (
        <div className="list">
          {shown.map((it) => (
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

/** Page d'ajout dédiée : les trois modes, puis le formulaire du mode choisi. */
export async function CatalogNewPage({ id, kind, mode }: { id: string; kind: "drink" | "dish"; mode?: string }) {
  const me = await requireOrganizer();
  const ev = await loadEvent(id);
  const m = isAddMode(mode) ? mode : null;
  const L = kind === "drink" ? { title: "Ajouter des boissons", eyebrow: "Boissons", path: "drinks", one: "Le nom d’une boisson." } : { title: "Ajouter des plats", eyebrow: "Plats", path: "buffet", one: "Le nom d’un plat." };
  return (
    <>
      <PageHeader eyebrow={L.eyebrow} title={L.title} sub="Choisissez comment compléter la liste." />
      {!canWrite(ev, me) ? <Notice>Cet événement ne peut plus être modifié.</Notice> : (
        <div className="grid" style={{ gap: 16 }}>
          <AddModes base={`/events/${id}/${L.path}/new`} current={m} text={{ one: L.one, file: "Fichier Excel (.xlsx) ou CSV, un nom par ligne.", paste: "Un nom par ligne." }} />
          {m && <CatalogAdd key={m} eventId={id} kind={kind} mode={m} />}
        </div>
      )}
    </>
  );
}