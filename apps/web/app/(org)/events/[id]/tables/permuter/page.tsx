import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkMoves, type Guest } from "@ceremonia/core";
import { tableData, kindHint } from "@/lib/tables";
import { evShape, type GuestRow } from "@/lib/event";
import { PageHeader, Notice, Empty } from "@/components/ui";
import { CardAction } from "@/components/TableActions";
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
  const a = UUID.test(sp.a || "") ? placed.find((g) => g.id === sp.a) : undefined;
  const b = a && UUID.test(sp.b || "") ? placed.find((g) => g.id === sp.b && g.table_no !== a.table_no) : undefined;
  const href = (o: { a?: string; b?: string }) => `${base}/permuter?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString()}`;

  const List = ({ items, pick }: { items: GuestRow[]; pick: (g: GuestRow) => string }) => {
    const by = new Map<number, GuestRow[]>();
    for (const g of items) by.set(g.table_no!, [...(by.get(g.table_no!) || []), g]);
    return (
      <div className="grid" style={{ gap: 14 }}>
        {[...by.entries()].sort((x, y) => x[0] - y[0]).map(([t, gs]) => (
          <section key={t}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Table {t}</h3>
            <div className="list">{gs.map((g) => (
              <Link key={g.id} className="li pickrow" href={pick(g)}>
                <span style={{ flex: 1, minWidth: 0 }}><b>{g.name}</b><small className="hint" style={{ display: "block" }}>Table {g.table_no} · {kindHint(g)}</small></span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}</div>
          </section>
        ))}
      </div>
    );
  };

  let step: ReactNode;
  if (placed.length < 2 || new Set(placed.map((g) => g.table_no)).size < 2) {
    step = <Empty>Il faut au moins deux invités assis à deux tables différentes pour permuter. <br /><br /><Link className="btn" href={`${base}/placer`}>Placer les invités</Link></Empty>;
  } else if (!a) {
    step = (
      <>
        <p className="hint" style={{ marginBottom: 10 }}><b>Étape 1 sur 3</b> · Choisissez le premier invité.</p>
        <List items={placed} pick={(g) => href({ a: g.id })} />
      </>
    );
  } else if (!b) {
    step = (
      <>
        <Notice>Premier invité : <b>{a.name}</b>, table {a.table_no}. <Link href={href({})}>Changer</Link></Notice>
        <p className="hint" style={{ marginBottom: 10 }}><b>Étape 2 sur 3</b> · Choisissez l’invité avec qui échanger la place (une autre table).</p>
        <List items={placed.filter((g) => g.table_no !== a.table_no)} pick={(g) => href({ a: a.id, b: g.id })} />
        <p className="hint" style={{ marginTop: 14 }}>Vous voulez seulement déplacer {a.name} vers une place libre, sans échange ? <Link href={`${base}/manuel/${a.id}?move=1`}>Déplacer {a.name}</Link></p>
      </>
    );
  } else {
    const errs = checkMoves(evShape(ev), guests as Guest[], { [a.id]: b.table_no!, [b.id]: a.table_no! });
    step = (
      <section className="card form" style={{ maxWidth: 720 }}>
        <p className="hint"><b>Étape 3 sur 3</b> · Vérifiez puis confirmez.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Invité</th><th>Table actuelle</th><th>Après la permutation</th></tr></thead>
          <tbody>
            <tr><td><b>{a.name}</b><br /><span className="hint">{kindHint(a)}</span></td><td>Table {a.table_no}</td><td><b>Table {b.table_no}</b></td></tr>
            <tr><td><b>{b.name}</b><br /><span className="hint">{kindHint(b)}</span></td><td>Table {b.table_no}</td><td><b>Table {a.table_no}</b></td></tr>
          </tbody>
        </table></div>
        {errs.length ? (
          <Notice tone="bad">Permutation impossible : {errs.join(" ")} Aucune place n’a été modifiée.</Notice>
        ) : (
          <CardAction action={confirmSwap} hidden={{ event_id: id, a: a.id, b: b.id }} className="btn pay-main" pendingLabel="Enregistrement…">
            Confirmer la permutation
          </CardAction>
        )}
        <div className="row"><Link className="btn ghost" href={href({ a: a.id })}>Choisir un autre invité</Link><Link className="btn ghost" href={base}>Annuler</Link></div>
      </section>
    );
  }
  return (
    <>
      <PageHeader eyebrow="Tables" title="Permuter les invités" sub="Échangez les places de deux invités assis à des tables différentes." />
      {step}
    </>
  );
}
