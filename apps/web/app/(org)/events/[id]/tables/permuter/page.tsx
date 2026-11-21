import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkMoves, type Guest } from "@ceremonia/core";
import { tableData, kindHint, planGroupSwap } from "@/lib/tables";
import { evShape, type GuestRow } from "@/lib/event";
import { PageHeader, Notice, Empty } from "@/components/ui";
import { CardAction } from "@/components/TableActions";
import { PermuterPicker } from "@/components/PermuterPicker";
import { confirmSwap } from "../actions";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Permutation de deux invités assis à des tables différentes :
 * 1. premier invité, 2. second invité, 3. affectations actuelles et résultat prévu, vérification, confirmation.
 * La vérification est refaite par le serveur au moment de la confirmation ; rien n'est enregistré en cas d'échec.
 */
export default async function Permuter({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ev, guests, write } = await tableData(id);
  const base = `/events/${id}/tables`;
  if (!write) redirect(base);
  const placed = guests.filter((g) => g.table_no);
  // Un groupe = un ou plusieurs invités assis à la même table, séparés par « . » dans l'URL.
  // A : invités d'une ou plusieurs tables ; B : invités d'une seule autre table.
  const group = (s: string | undefined, single: boolean, not: number[] = []): GuestRow[] | undefined => {
    const ids = [...new Set((s || "").split(".").filter((x) => UUID.test(x)))];
    const gs = ids.map((i) => placed.find((g) => g.id === i));
    if (!ids.length || gs.some((g) => !g || not.includes(g.table_no!)) || (single && new Set(gs.map((g) => g!.table_no)).size !== 1)) return undefined;
    return gs as GuestRow[];
  };
  const a = group(sp.a, false);
  const aTables = a ? [...new Set(a.map((g) => g.table_no!))].sort((x, y) => x - y) : [];
  const b = a && group(sp.b, true, aTables);
  const href = (o: { a?: string; b?: string }) => `${base}/permuter?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()}`;
  const names = (gs: GuestRow[]) => gs.map((g) => g.name).join(", ");

  const List = ({ items, param, keep, label }: { items: GuestRow[]; param: "a" | "b"; keep?: string; label: string }) => (
    <PermuterPicker
      single={param === "b"}
      placeholder="Rechercher un nom, un numéro, un code ou une table"
      base={base}
      param={param}
      keep={keep}
      label={label}
      items={items.map((g) => ({ id: g.id, name: g.name, table: g.table_no!, whatsapp: g.whatsapp || "", code: g.code || "", hint: kindHint(g) }))}
    />
  );

  let step: ReactNode;
  if (placed.length < 2 || new Set(placed.map((g) => g.table_no)).size < 2) {
    step = <Empty>Il faut au moins deux invités assis à deux tables différentes pour permuter. <br /><br /><Link className="btn" href={`${base}/placer`}>Placer les invités</Link></Empty>;
  } else if (!a) {
    step = (
      <>
        <p className="hint" style={{ marginBottom: 10 }}><b>Étape 1 sur 3</b> · Cochez les invités à déplacer. Vous pouvez en choisir plusieurs, de plusieurs tables.</p>
        <List items={placed} param="a" label="Continuer" />
      </>
    );
  } else if (!b) {
    step = (
      <>
        <Notice>{a.length > 1 ? "Invités à déplacer" : "Invité à déplacer"} : <b>{names(a)}</b>, {aTables.length > 1 ? "tables" : "table"} {aTables.join(", ")}. <Link href={href({})}>Changer</Link></Notice>
        <p className="hint" style={{ marginBottom: 10 }}><b>Étape 2 sur 3</b> · Choisissez, dans <b>une seule table</b>, les invités avec qui échanger les places. Les invités déplacés iront à cette table.</p>
        <List items={placed.filter((g) => !aTables.includes(g.table_no!))} param="b" keep={a.map((g) => g.id).join(".")} label="Vérifier" />
        {a.length === 1 && <p className="hint" style={{ marginTop: 14 }}>Vous voulez seulement déplacer {a[0].name} vers une place libre, sans échange ? <Link href={`${base}/manuel/${a[0].id}?move=1`}>Déplacer {a[0].name}</Link></p>}
      </>
    );
  } else {
    const tb = b[0].table_no!;
    const moves = planGroupSwap(a, b);
    const errs = checkMoves(evShape(ev), guests as Guest[], moves);
    const aIds = a.map((g) => g.id).join("."), bIds = b.map((g) => g.id).join(".");
    step = (
      <section className="card form" style={{ maxWidth: 720 }}>
        <p className="hint"><b>Étape 3 sur 3</b> · Vérifiez puis confirmez.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Invité</th><th>Table actuelle</th><th>Après la permutation</th></tr></thead>
          <tbody>
            {a.map((g) => <tr key={g.id}><td><b>{g.name}</b><br /><span className="hint">{kindHint(g)}</span></td><td>Table {g.table_no}</td><td><b>Table {moves[g.id]}</b></td></tr>)}
            {b.map((g) => <tr key={g.id}><td><b>{g.name}</b><br /><span className="hint">{kindHint(g)}</span></td><td>Table {g.table_no}</td><td><b>Table {moves[g.id]}</b></td></tr>)}
          </tbody>
        </table></div>
        {errs.length ? (
          <Notice tone="bad">Permutation impossible : {errs.join(" ")} Aucune place n’a été modifiée.</Notice>
        ) : (
          <CardAction action={confirmSwap} hidden={{ event_id: id, a: aIds, b: bIds }} className="btn pay-main" pendingLabel="Enregistrement…">
            Confirmer la permutation
          </CardAction>
        )}
        <div className="row"><Link className="btn ghost" href={href({ a: aIds })}>Choisir d’autres invités</Link><Link className="btn ghost" href={base}>Annuler</Link></div>
      </section>
    );
  }
  return (
    <>
      <PageHeader eyebrow="Tables" title="Permuter les invités" sub="Envoyez un ou plusieurs invités (de une ou plusieurs tables) à une autre table, en échange des invités que vous y choisissez." />
      {step}
    </>
  );
}
