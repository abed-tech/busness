/**
 * Miroir de la table role_permissions (voir docs/PERMISSIONS.md).
 * Sert UNIQUEMENT à adapter l'interface : chaque opération est revérifiée par la base.
 */
export type AdminRole = "super" | "moderator" | "manager";
export type Perm =
  | "dashboard.read" | "events.read" | "events.create" | "events.write" | "events.suspend" | "events.delete"
  | "guests.read" | "organizers.read" | "organizers.suspend" | "finance.read" | "finance.refund"
  | "reports.read" | "reports.export" | "audit.read" | "admins.manage" | "settings.write" | "security.read";

export const ROLE_LABEL: Record<AdminRole, string> = { super: "Administrateur principal", moderator: "Modérateur", manager: "Gestionnaire" };
