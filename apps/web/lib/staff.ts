export const ROLE = {
  controller: { one: "Contrôleur", many: "Contrôleurs", app: "Contrôle des entrées", ph: "Jean, entrée principale" },
  server: { one: "Serveur", many: "Serveurs", app: "Service", ph: "Marie, service salle" },
} as const;
export type StaffRole = keyof typeof ROLE;
export const isRole = (r: string): r is StaffRole => r === "controller" || r === "server";
