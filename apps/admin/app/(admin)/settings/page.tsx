import { requireAdmin, rpc } from "@/lib/auth";
import { serverClient } from "@/lib/data/server";
import { PageHeader, ErrorBox } from "@/components/ui";
import { ConfirmAction } from "@/components/ConfirmAction";
import { date, money } from "@/lib/format";
import { ROLE_LABEL, type AdminRole } from "@/lib/perms";
import { ActionForm } from "../events/[id]/ActionForm";
import { saveRetention, savePricing, saveStaffLimits, grantAdmin, updateAdmin } from "./actions";

type Admin = { user_id: string; email: string; role: AdminRole; name: string; active: boolean; created_at: string; me: boolean };
type Retention = { enabled: boolean; days: number; from: "creation" | "event_date" };
type Pricing = { currency: string; unit_cents: number; unit_persons: number };
type Limits = { max_controllers: number; max_servers: number };

export default async function SettingsPage() {
  const s = await requireAdmin("dashboard.read");
  const sb = await serverClient();
  const { data: rows } = await sb.from("settings").select("key, value, updated_at");
  const get = <T,>(k: string) => (rows || []).find((x: { key: string }) => x.key === k) as { value: T; updated_at: string } | undefined;
  const ret = get<Retention>("retention"), pr = get<Pricing>("pricing"), lim = get<Limits>("staff_limits");
  const canWrite = s.perms.has("settings.write");
  const admins = s.perms.has("admins.manage") ? await rpc<{ items: Admin[] }>("admin_list_admins") : null;
  const { data: factors } = await sb.auth.mfa.listFactors();
  const totp = (factors?.totp || []).filter((f: { status: string }) => f.status === "verified").length;

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Paramètres" sub="Toute modification est vérifiée par le serveur et inscrite au journal." />
      <div className="grid" style={{ gap: 16, maxWidth: 900 }}>
        <section className="card">
          <h2>Mon compte</h2>
          <dl className="kv"><dt>Nom</dt><dd>{s.name}</dd><dt>E-mail</dt><dd>{s.email}</dd><dt>Rôle</dt><dd>{ROLE_LABEL[s.role]}</dd>
            <dt>Second facteur</dt><dd>{totp ? <span className="badge ok">Activé ({totp} appareil{totp > 1 ? "s" : ""})</span> : <span className="badge bad">Non activé</span>}</dd></dl>
          <p className="hint" style={{ marginTop: 10 }}>« Se déconnecter » ferme la session sur tous vos appareils. Sans activité pendant {process.env.ADMIN_IDLE_MINUTES || 30} minutes, la session se ferme automatiquement.</p>
        </section>

        <section className="card">
          <h2>Conservation des données</h2>
          {!ret ? <ErrorBox message="Paramètre introuvable." /> : (
            <>
              <p className="notice" style={{ marginBottom: 12 }}>
                {ret.value.enabled
                  ? <>Active : les données opérationnelles d’un événement (invités, tables, commandes, accès, suivis) sont supprimées <b>{ret.value.days} jour(s)</b> après {ret.value.from === "creation" ? "sa création" : "sa date"}.</>
                  : <>Désactivée : aucune suppression automatique n’a lieu tant qu’elle n’est pas activée ici.</>}
                {" "}Les transactions, preuves de paiement, rapports et le journal sont toujours conservés.
              </p>
              {canWrite ? (
                <ActionForm action={saveRetention} hidden={{}} submit="Enregistrer la règle">
                  <label className="row"><input type="checkbox" name="enabled" defaultChecked={ret.value.enabled} /> Activer la suppression automatique</label>
                  <div className="grid g2">
                    <div className="fld"><label htmlFor="days">Délai (jours)</label><input id="days" name="days" type="number" min={1} max={3650} defaultValue={ret.value.days} required /></div>
                    <div className="fld"><label htmlFor="from">À compter de</label><select id="from" name="from" defaultValue={ret.value.from}><option value="creation">La création de l’événement</option><option value="event_date">La date de l’événement</option></select></div>
                  </div>
                </ActionForm>
              ) : <p className="hint">Modifiable uniquement par l’administrateur principal.</p>}
            </>
          )}
        </section>

        <section className="card">
          <h2>Tarif</h2>
          {pr && <p style={{ marginBottom: 12 }}>{money(pr.value.unit_cents, pr.value.currency)} par tranche de {pr.value.unit_persons} personnes · un couple compte pour 2. Le montant est toujours calculé par le serveur.</p>}
          {pr && canWrite && (
            <ActionForm action={savePricing} hidden={{}} submit="Enregistrer le tarif">
              <div className="grid g3">
                <div className="fld"><label htmlFor="price">Prix par tranche</label><input id="price" name="price" type="number" step="0.01" min={0.01} defaultValue={pr.value.unit_cents / 100} required /></div>
                <div className="fld"><label htmlFor="unit_persons">Personnes par tranche</label><input id="unit_persons" name="unit_persons" type="number" min={1} defaultValue={pr.value.unit_persons} required /></div>
                <div className="fld"><label htmlFor="currency">Devise</label><select id="currency" name="currency" defaultValue={pr.value.currency}><option>USD</option><option>CDF</option><option>EUR</option></select></div>
              </div>
            </ActionForm>
          )}
        </section>

        <section className="card">
          <h2>Personnel du jour J</h2>
          {lim && <p style={{ marginBottom: 12 }}>Par événement : {lim.value.max_controllers} contrôleur(s) et {lim.value.max_servers} serveur(s) au maximum.</p>}
          {lim && canWrite && (
            <ActionForm action={saveStaffLimits} hidden={{}} submit="Enregistrer les limites">
              <div className="grid g2">
                <div className="fld"><label htmlFor="mc">Contrôleurs max.</label><input id="mc" name="max_controllers" type="number" min={0} max={200} defaultValue={lim.value.max_controllers} required /></div>
                <div className="fld"><label htmlFor="ms">Serveurs max.</label><input id="ms" name="max_servers" type="number" min={0} max={500} defaultValue={lim.value.max_servers} required /></div>
              </div>
            </ActionForm>
          )}
        </section>

        {admins && (
          <section className="card">
            <h2>Administrateurs</h2>
            {!admins.ok ? <ErrorBox message={admins.message} /> : (
              <div className="tbl-wrap" style={{ marginBottom: 16 }}><table className="tbl">
                <thead><tr><th>Administrateur</th><th>Rôle</th><th className="hide-m">Depuis</th><th>Accès</th><th></th></tr></thead>
                <tbody>{admins.data.items.map((a) => (
                  <tr key={a.user_id}>
                    <td><b>{a.name}</b>{a.me && <span className="hint"> (vous)</span>}<br /><span className="hint">{a.email}</span></td>
                    <td>{ROLE_LABEL[a.role]}</td>
                    <td className="hide-m">{date(a.created_at)}</td>
                    <td>{a.active ? <span className="badge ok">Actif</span> : <span className="badge">Désactivé</span>}</td>
                    <td className="r"><div className="row" style={{ justifyContent: "flex-end" }}>
                      {(["super", "moderator", "manager"] as AdminRole[]).filter((r) => r !== a.role).map((r) => (
                        <ConfirmAction key={r} action={updateAdmin} label={`→ ${ROLE_LABEL[r]}`} title={`Passer ${a.name} en ${ROLE_LABEL[r]} ?`} body="Les nouveaux droits s’appliquent immédiatement, y compris sur les sessions ouvertes." confirmLabel="Confirmer" hidden={{ user_id: a.user_id, role: r, name: a.name, active: String(a.active) }} />
                      ))}
                      {a.active
                        ? <ConfirmAction action={updateAdmin} danger label="Désactiver" title={`Désactiver ${a.name} ?`} body="La personne perd immédiatement tout accès à l’administration." confirmLabel="Désactiver" hidden={{ user_id: a.user_id, role: a.role, name: a.name, active: "false" }} />
                        : <ConfirmAction action={updateAdmin} label="Réactiver" title={`Réactiver ${a.name} ?`} body="La personne retrouve l’accès avec son rôle actuel." confirmLabel="Réactiver" hidden={{ user_id: a.user_id, role: a.role, name: a.name, active: "true" }} />}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <h3 style={{ fontSize: "1.15rem", marginBottom: 8 }}>Nommer un administrateur</h3>
            <p className="hint" style={{ marginBottom: 10 }}>Créez d’abord le compte avec une adresse dédiée (commande <code>pnpm admin:create &lt;e-mail&gt; "&lt;nom&gt;" --role moderator</code>, voir docs/DEPLOIEMENT-RENDER.md), ou nommez ici un compte existant. Un compte organisateur ne peut jamais recevoir de rôle d’administration.</p>
            <ActionForm action={grantAdmin} hidden={{}} submit="Attribuer le rôle">
              <div className="grid g3">
                <div className="fld"><label htmlFor="ga-email">E-mail</label><input id="ga-email" name="email" type="email" required maxLength={254} autoComplete="off" /></div>
                <div className="fld"><label htmlFor="ga-name">Nom affiché</label><input id="ga-name" name="name" required minLength={2} maxLength={80} /></div>
                <div className="fld"><label htmlFor="ga-role">Rôle</label><select id="ga-role" name="role" defaultValue="manager"><option value="manager">Gestionnaire</option><option value="moderator">Modérateur</option><option value="super">Administrateur principal</option></select></div>
              </div>
            </ActionForm>
          </section>
        )}
      </div>
    </>
  );
}
