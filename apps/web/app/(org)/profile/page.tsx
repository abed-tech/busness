import { requireOrganizer } from "@/lib/auth";
import { PageHeader, BackLink } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { updateProfile, changePassword } from "./actions";

export default async function Profile() {
  const me = await requireOrganizer();
  return (
    <main className="org-main">
      <PageHeader eyebrow="Compte" title="Mon profil" actions={<BackLink href="/events">Mes événements</BackLink>} />
      <div className="grid g2">
        <section className="card form">
          <h2>Informations</h2>
          <ActionForm action={updateProfile} hidden={{}} submit="Enregistrer">
            <div className="fld"><label htmlFor="u">Nom d’utilisateur</label><input id="u" name="username" defaultValue={me.username} required minLength={2} maxLength={40} /></div>
            <div className="fld"><label htmlFor="f">Nom complet</label><input id="f" name="full_name" defaultValue={me.full_name || ""} maxLength={120} /></div>
            <div className="fld"><label htmlFor="p">Téléphone</label><input id="p" name="phone" type="tel" defaultValue={me.phone || ""} maxLength={20} /></div>
            <p className="hint">E-mail : {me.email}</p>
          </ActionForm>
        </section>
        <section className="card form">
          <h2>Mot de passe</h2>
          <ActionForm action={changePassword} hidden={{}} submit="Changer le mot de passe">
            <div className="fld"><label htmlFor="c">Mot de passe actuel</label><input id="c" name="current" type="password" required autoComplete="current-password" /></div>
            <div className="fld"><label htmlFor="n1">Nouveau mot de passe</label><input id="n1" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></div>
            <div className="fld"><label htmlFor="n2">Confirmer</label><input id="n2" name="password2" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></div>
          </ActionForm>
        </section>
      </div>
    </main>
  );
}
