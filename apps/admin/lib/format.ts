export const money = (cents: number | null | undefined, currency = "USD") =>
  cents == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const date = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "—");
export const dateTime = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
export const month = (d: string) => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(d + "T00:00:00"));
export const STATUS_LABEL: Record<string, string> = {
  active: "Actif", suspended: "Suspendu", deleted: "Supprimé",
  pending: "En attente", succeeded: "Réussie", failed: "Échouée", refunded: "Remboursée",
  success: "Réussi", denied: "Refusé", error: "Erreur",
};
export const ORIGIN_LABEL: Record<string, string> = { organizer: "Organisateur", admin_platform: "Plateforme (gratuit)", admin_for_organizer: "Offert à un organisateur" };
export const METHOD_LABEL: Record<string, string> = { mobile_money: "Mobile money", card: "Carte bancaire" };
export const TYPE_LABEL: Record<string, string> = { mariage: "Mariage", fiancailles: "Fiançailles", anniversaire: "Anniversaire", bapteme: "Baptême", gala: "Gala", conference: "Conférence" };
