import { requireAdmin, rpc } from "@/lib/auth";
import { PageHeader, ErrorBox, Empty, Pager, StatusBadge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { ROLE_LABEL, type AdminRole } from "@/lib/perms";

type Row = { id: number; at: string; actor_label: string; actor_role: string; action: string; object_type: string; object_id: string | null; result: string; details: Record<string, unknown> };
const FAMILIES = [["", "Toutes les opérations"], ["event.", "Événements"], ["organizer.", "Organisateurs"], ["payment.", "Paiements"], ["report.", "Rapports et exports"], ["admin.", "Administrateurs"], ["settings.", "Paramètres"], ["staff.", "Contrôleurs et serveurs"], ["auth.", "Connexions admin"]] as const;
const ACTION_LABEL: Record<string, string> = {
  "event.create": "Création d’événement", "event.update": "Modification d’événement", "event.suspend": "Suspension d’événement", "event.reactivate": "Réactivation d’événement",
  "event.delete": "Suppression d’événement", "event.retention_purge": "Suppression automatique (conservation)", "organizer.suspend": "Suspension d’organisateur",
  "organizer.reactivate": "Réactivation d’organisateur", "payment.succeeded": "Paiement confirmé", "payment.failed": "Paiement échoué", "payment.refunded": "Remboursement",
  "payment.amount_mismatch": "Montant de paiement incohérent", "report.export": "Export", "report.close_month": "Clôture mensuelle", "admin.role": "Rôle administrateur", "settings.update": "Paramètre modifié", "event.table_plan": "Plan de table", "staff.create": "Accès personnel créé", "staff.login": "Connexion du personnel",
  "auth.admin_login": "Connexion à l’administration",
};
const roleLabel = (r: string) => ROLE_LABEL[r as AdminRole] || ({ system: "Système", organizer: "Organisateur" } as Record<string, string>)[r] || r;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ a?: string; r?: string; page?: string }> }) {
  await requireAdmin("audit.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const a = FAMILIES.some(([k]) => k === sp.a) ? sp.a || "" : "";
  const res = ["success", "denied", "error"].includes(sp.r || "") ? sp.r! : "";
  const r = await rpc<{ total: number; items: Row[] }>("admin_audit", { p_action: a || null, p_result: res || null, p_page: page, p_size: 50 });
  const href = (p: number) => "/audit?" + new URLSearchParams(Object.entries({ a, r: res, page: String(p) }).filter(([, v]) => v)).toString();
  return (
    <>
      <PageHeader eyebrow="Sécurité" title="Journal d’activité" sub="Chaque opération sensible et chaque refus sont enregistrés. Ce journal ne peut être ni modifié ni effacé, y compris par un administrateur." />
      <form className="sticky-tools">
        <select className="in" name="a" defaultValue={a} aria-label="Opération">{FAMILIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="in" name="r" defaultValue={res} aria-label="Résultat" style={{ flex: "0 0 180px" }}>
          <option value="">Tous les résultats</option><option value="success">Réussi</option><option value="denied">Refusé</option><option value="error">Erreur</option>
        </select>
        <button className="btn ghost" type="submit">Filtrer</button>
      </form>
      {!r.ok ? <ErrorBox message={r.message} /> : !r.data.items.length ? <Empty>Aucune entrée.</Empty> : (
        <>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>Auteur</th><th>Opération</th><th className="hide-m">Objet</th><th>Résultat</th></tr></thead>
            <tbody>{r.data.items.map((x) => (
              <tr key={x.id}>
                <td style={{ whiteSpace: "nowrap" }}>{dateTime(x.at)}</td>
                <td>{x.actor_label}<br /><span className="hint">{roleLabel(x.actor_role)}</span></td>
                <td>{ACTION_LABEL[x.action] || x.action}{typeof x.details?.reason === "string" && x.details.reason && <><br /><span className="hint">Motif : {x.details.reason}</span></>}</td>
                <td className="hide-m"><span className="hint">{x.object_type}</span><br /><code style={{ fontSize: ".8rem" }}>{x.object_id || "—"}</code></td>
                <td><StatusBadge s={x.result} /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pager page={page} size={50} total={r.data.total} href={href} />
        </>
      )}
    </>
  );
}
