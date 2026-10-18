export const money = (cents: number | null | undefined, currency = "USD") =>
  cents == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const date = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d.length === 10 ? d + "T12:00:00" : d)) : "—");
export const longDate = (d: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T12:00:00"));
export const dateTime = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
export const hm = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "");
export const plur = (n: number, one: string, many?: string) => `${n} ${n > 1 ? many || one + "s" : one}`;
export const TYPE_LABEL: Record<string, string> = { mariage: "Mariage", fiancailles: "Fiançailles", anniversaire: "Anniversaire", bapteme: "Baptême", gala: "Gala", conference: "Conférence" };
export const OFFER_LABEL: Record<string, string> = { both: "Boissons et buffet", drinks: "Boissons seulement", food: "Buffet seulement", none: "Ni boissons ni buffet" };
export const TX_LABEL: Record<string, string> = { pending: "En attente", succeeded: "Réussi", failed: "Échoué", refunded: "Remboursé" };
export const offersDrinks = (o: string) => o === "both" || o === "drinks";
export const offersFood = (o: string) => o === "both" || o === "food";

/** Types d'événement : libellés des champs, capacité par défaut, textes proposés (repris du prototype). */
export const TYPES: Record<string, { label: string; a: string; b?: string; cap: number; msg: string; prog: string }> = {
  mariage: { label: "Mariage", a: "Prénom du marié", b: "Prénom de la mariée", cap: 10,
    msg: "Nos familles ont la joie de vous convier à la célébration de notre union. Votre présence rendra cette journée inoubliable.",
    prog: "14:00 | Cérémonie civile\n16:00 | Bénédiction nuptiale\n18:30 | Cocktail et photos\n20:00 | Dîner de gala\n22:30 | Première danse et soirée dansante" },
  fiancailles: { label: "Fiançailles", a: "Prénom du fiancé", b: "Prénom de la fiancée", cap: 10,
    msg: "Nous avons la joie de vous annoncer nos fiançailles et serions honorés de partager ce moment avec vous.",
    prog: "17:00 | Accueil des invités\n18:00 | Cérémonie\n19:30 | Dîner\n21:00 | Soirée" },
  anniversaire: { label: "Anniversaire", a: "Personne fêtée", cap: 8,
    msg: "Venez célébrer avec nous ce bel anniversaire. Votre présence est le plus beau des cadeaux.",
    prog: "18:00 | Accueil\n19:00 | Dîner\n21:00 | Gâteau et soirée" },
  bapteme: { label: "Baptême", a: "Prénom de l’enfant", cap: 8,
    msg: "Nous avons la joie de vous convier au baptême de notre enfant.",
    prog: "10:00 | Célébration\n12:30 | Réception" },
  gala: { label: "Gala", a: "Nom du gala", b: "Organisé par (facultatif)", cap: 10,
    msg: "Nous avons l’honneur de vous convier à notre soirée de gala.",
    prog: "19:00 | Accueil et cocktail\n20:00 | Dîner\n22:00 | Soirée" },
  conference: { label: "Conférence", a: "Nom de la conférence", b: "Organisé par (facultatif)", cap: 10,
    msg: "Nous avons le plaisir de vous inviter à notre conférence.",
    prog: "09:00 | Accueil\n09:30 | Ouverture\n12:30 | Déjeuner\n14:00 | Ateliers" },
};
export const titleOf = (type: string, a: string, b: string) => {
  a = a.trim(); b = b.trim();
  if (type === "mariage" || type === "fiancailles") return a && b ? `${a} & ${b}` : a || b;
  if (type === "anniversaire") return a ? `Anniversaire de ${a}` : "";
  if (type === "bapteme") return a ? `Baptême de ${a}` : "";
  return a;
};
