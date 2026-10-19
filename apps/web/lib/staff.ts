import { splitRows } from "@ceremonia/core";

export const ROLE = {
  controller: { one: "Contrôleur", many: "Contrôleurs", app: "Contrôle des entrées", ph: "Jean, entrée principale" },
  server: { one: "Serveur", many: "Serveurs", app: "Service", ph: "Marie, service salle" },
} as const;
export type StaffRole = keyof typeof ROLE;
export const isRole = (r: string): r is StaffRole => r === "controller" || r === "server";

export const STAFF_LIST_MAX = 50;

/** Liste collée ou importée : « Nom ; Mot de passe » par ligne, mot de passe facultatif (généré sinon). Mêmes règles que la création unitaire. */
export function parseStaff(text: string): { rows: { name: string; password: string }[]; issues: string[] } {
  const rows = splitRows(text);
  if (rows.length && /^(nom|name|noms)$/i.test((rows[0][0] || "").trim())) rows.shift();
  const out: { name: string; password: string }[] = [], issues: string[] = [];
  rows.forEach((r, i) => {
    const name = (r[0] || "").trim(), password = (r[1] || "").trim();
    if (!name) return;
    if (name.length > 60) issues.push(`Ligne ${i + 1} : nom trop long (60 caractères maximum).`);
    else if (password && (password.length < 6 || password.length > 64)) issues.push(`Ligne ${i + 1} : le mot de passe doit contenir entre 6 et 64 caractères.`);
    else out.push({ name, password });
  });
  return { rows: out, issues };
}
