/**
 * @ceremonia/core — logique métier partagée (espace organisateur, espace admin).
 * Aucune dépendance au navigateur ni à la base : fonctions pures, testées.
 * La base de données revérifie toujours les règles critiques (capacité, couples, droits).
 */

export type GuestKind = "mr" | "mme" | "couple";
export interface Guest {
  id: string;
  name: string;
  kind: GuestKind | null;
  table_no: number | null;
  placed_manually?: boolean;
  whatsapp?: string;
}
export interface EventShape {
  table_capacity: number;
  expected: number;
  extra_tables: number;
}
export interface TableLoad {
  n: number;
  guests: Guest[];
  used: number;
  free: number;
  ghost: boolean;
}
export type Plan = Record<string, number>; // guest id -> table (0 = sans table)

export const KIND_LABEL: Record<GuestKind, string> = { mr: "Monsieur", mme: "Madame", couple: "Couple" };
export const seats = (g: Pick<Guest, "kind">): number => (g.kind === "couple" ? 2 : 1);
export const persons = (guests: Pick<Guest, "kind">[]): number => guests.reduce((a, g) => a + seats(g), 0);

/** Nombre de tables : personnes réelles (couple = 2) ou attendues, divisé par la capacité, arrondi au supérieur. */
export function tableCount(ev: EventShape, guests: Pick<Guest, "kind">[]): number {
  if (!(ev.table_capacity > 0)) return 0;
  return Math.max(1, Math.ceil(Math.max(persons(guests), ev.expected || 0) / ev.table_capacity)) + (ev.extra_tables || 0);
}

export function loads(ev: EventShape, guests: Guest[], plan?: Plan): TableLoad[] {
  const tc = tableCount(ev, guests);
  const tOf = (g: Guest) => (plan && g.id in plan ? plan[g.id] : g.table_no || 0) || 0;
  const by: Record<number, Guest[]> = {};
  let max = tc;
  for (const g of guests) {
    const t = tOf(g);
    if (t > 0) {
      (by[t] = by[t] || []).push(g);
      if (t > max) max = t;
    }
  }
  const out: TableLoad[] = [];
  for (let t = 1; t <= max; t++) {
    const gs = by[t] || [];
    const used = persons(gs);
    out.push({ n: t, guests: gs, used, free: ev.table_capacity - used, ghost: t > tc });
  }
  return out;
}

/** Vérifie un ensemble de déplacements (échanges compris) avant de l'envoyer au serveur. */
export function checkMoves(ev: EventShape, guests: Guest[], moves: Plan): string[] {
  const tc = tableCount(ev, guests);
  const errs: string[] = [];
  const use: Record<number, number> = {};
  const touched = new Set<number>();
  for (const g of guests) {
    const t = g.id in moves ? moves[g.id] : g.table_no || 0;
    if (t > 0) use[t] = (use[t] || 0) + seats(g);
    if (g.id in moves) {
      if (moves[g.id] > 0) touched.add(moves[g.id]);
      if (g.table_no) touched.add(g.table_no);
    }
  }
  for (const id of Object.keys(moves)) if (moves[id] > tc) errs.push(`La table ${moves[id]} n’existe pas : il y a ${tc} table(s).`);
  for (const t of touched) if ((use[t] || 0) > ev.table_capacity) errs.push(`La table ${t} aurait ${use[t]} personnes pour ${ev.table_capacity} places.`);
  return errs;
}

export interface AutoResult {
  ok: true;
  plan: Plan;
  manual: Record<string, boolean>;
  placed: number;
  kept: number;
}
export interface AutoError {
  ok: false;
  errors: string[];
}

/**
 * Attribution automatique : couples toujours ensemble, capacité jamais dépassée.
 * Réussit si et seulement si c'est possible (places libres suffisantes et assez
 * d'emplacements de 2 places côte à côte pour les couples).
 */
export function autoAssign(ev: EventShape, guests: Guest[], opts: { keep: boolean; strategy: "fill" | "balance" }): AutoResult | AutoError {
  if (!guests.length) return { ok: false, errors: ["Aucun invité à placer."] };
  if (!(ev.table_capacity > 0)) return { ok: false, errors: ["Indiquez le nombre de places par table."] };
  if (ev.table_capacity < 2 && guests.some((g) => seats(g) === 2)) return { ok: false, errors: ["Une table d’une seule place ne peut pas accueillir de couple."] };
  const tc = tableCount(ev, guests);
  const cap = ev.table_capacity;
  const plan: Plan = {};
  const manual: Record<string, boolean> = {};
  const free = Array(tc + 1).fill(cap);
  free[0] = 0;
  let kept = 0;
  if (opts.keep) {
    const L = loads(ev, guests);
    const bad = L.filter((l) => (l.ghost && l.guests.length) || l.used > cap);
    if (bad.length) return { ok: false, errors: bad.map((l) => (l.ghost ? `Des invités sont à la table ${l.n}, qui n’existe plus.` : `La table ${l.n} dépasse sa capacité.`)).concat(["Corrigez ces placements, ou choisissez « Tout recalculer »."]) };
    for (const g of guests) {
      const x = g.table_no || 0;
      if (x > 0) {
        plan[g.id] = x;
        if (g.placed_manually) manual[g.id] = true;
        free[x] -= seats(g);
        kept++;
      }
    }
  }
  const todo = guests.filter((g) => !plan[g.id]);
  const couples = todo.filter((g) => seats(g) === 2);
  const singles = todo.filter((g) => seats(g) === 1);
  const need = couples.length * 2 + singles.length;
  const totFree = free.reduce((a: number, b: number) => a + b, 0);
  if (need > totFree) return { ok: false, errors: [`Il reste ${need} personnes à placer pour ${totFree} places libres. Ajoutez une table.`] };
  const coupleRoom = free.reduce((a: number, b: number, i: number) => (i ? a + Math.floor(b / 2) : a), 0);
  if (couples.length > coupleRoom) return { ok: false, errors: [`Les ${couples.length} couples ne peuvent pas tous rester ensemble : seulement ${coupleRoom} emplacement(s) de 2 places côte à côte.`] };
  const used0 = free.map((f: number) => cap - f);
  const eff = (lim: number) => free.map((_f: number, i: number) => (i ? Math.max(0, Math.min(cap, lim) - used0[i]) : 0));
  const feas = (F: number[], cl: number, sl: number) => {
    let tot = 0;
    let cp = 0;
    for (let i = 1; i <= tc; i++) {
      tot += F[i];
      cp += Math.floor(F[i] / 2);
    }
    return sl + 2 * cl <= tot && cl <= cp;
  };
  let L = cap;
  if (opts.strategy === "balance") {
    L = Math.max(1, Math.ceil((need + used0.reduce((a: number, b: number) => a + b, 0)) / tc));
    for (; L < cap; L++) if (feas(eff(L), couples.length, singles.length)) break;
    if (L > cap) L = cap;
  }
  const F = eff(L);
  let ci = 0;
  let si = 0;
  for (let tn = 1; tn <= tc; tn++) {
    let tCouple = 0;
    let tTot = 0;
    while (F[tn] > 0 && (ci < couples.length || si < singles.length)) {
      const cl = couples.length - ci;
      const sl = singles.length - si;
      const canC = cl > 0 && F[tn] >= 2;
      const canS = sl > 0;
      let c: boolean;
      if (canC && !canS) c = true;
      else if (!canC && canS) c = false;
      else if (!canC && !canS) break;
      else c = tTot === 0 ? true : tCouple / tTot < (2 * cl) / (2 * cl + sl);
      if (!c && canC) {
        F[tn] -= 1;
        const ok = feas(F, cl, sl - 1);
        F[tn] += 1;
        if (!ok) c = true;
      }
      if (c) {
        plan[couples[ci++].id] = tn;
        F[tn] -= 2;
        tCouple += 2;
        tTot += 2;
      } else {
        plan[singles[si++].id] = tn;
        F[tn] -= 1;
        tTot += 1;
      }
    }
  }
  if (ci < couples.length || si < singles.length) return { ok: false, errors: ["Impossible de placer tout le monde sans séparer de couple. Ajoutez une table."] };
  return { ok: true, plan, manual, placed: todo.length, kept };
}

// ---------------- placement proposé (aperçu avant confirmation) ----------------
export interface SeatingTable { n: number; guests: Guest[]; used: number; free: number; couples: number; singles: number; mixed: boolean }
export interface SeatingProposal {
  /** Placements à enregistrer : invités déplacés ou placés (0 = sans table). Les placements conservés n'y figurent pas. */
  plan: Plan;
  tables: SeatingTable[];
  unplaced: Guest[];
  problems: string[];
  placed: number;
  kept: number;
  mixedTables: number;
  unknownKind: number;
}

/**
 * Répartition proposée, sans rien enregistrer :
 * - un couple (une invitation de 2 places) n'est jamais séparé et aucune table n'est dépassée ;
 * - les couples sont regroupés entre eux, les personnes seules entre elles ; on ne mélange que si les tables manquent
 *   (couples ou personnes seules en surnombre) ou si les personnes seules sont trop peu nombreuses pour une table ;
 * - à l'intérieur de chaque groupe, les tables sont remplies de façon équilibrée, sur le moins de tables possible ;
 * - si tout le monde ne tient pas, les invités restants sont listés (jamais ignorés) et le problème est expliqué.
 */
export function planSeating(ev: EventShape, guests: Guest[], opts: { keep: boolean }): SeatingProposal {
  const cap = ev.table_capacity;
  const tc = cap > 0 ? tableCount(ev, guests) : 0;
  type T = { n: number; guests: Guest[]; used: number; c: number; s: number };
  const T: T[] = Array.from({ length: tc }, (_, i) => ({ n: i + 1, guests: [], used: 0, c: 0, s: 0 }));
  const put = (t: T, g: Guest) => { t.guests.push(g); t.used += seats(g); if (seats(g) === 2) t.c += 2; else t.s += 1; };
  const room = (t: T) => cap - t.used;
  let kept = 0;
  const todo: Guest[] = [];
  for (const g of guests) {
    const x = g.table_no || 0;
    const t = opts.keep && x >= 1 && x <= tc ? T[x - 1] : null;
    if (t && room(t) >= seats(g)) { put(t, g); kept++; } else todo.push(g);
  }
  const couples = todo.filter((g) => seats(g) === 2);
  const singles = todo.filter((g) => seats(g) === 1);
  const unplaced: Guest[] = [];
  const at: Record<string, number> = {};
  // répartition équilibrée : chaque invité va à la table la moins occupée qui peut l'accueillir
  const waterfill = (list: Guest[], tables: T[]): Guest[] => {
    const rest: Guest[] = [];
    for (const g of list) {
      let best: T | null = null;
      for (const t of tables) if (room(t) >= seats(g) && (!best || t.used < best.used || (t.used === best.used && t.n < best.n))) best = t;
      if (best) { put(best, g); at[g.id] = best.n; } else rest.push(g);
    }
    return rest;
  };
  const byRoom = (a: T, b: T) => room(b) - room(a) || a.n - b.n;

  // 1. couples : tables déjà « couples », puis tables vides, puis les autres ; le moins de tables possible
  if (couples.length) {
    const rank = (t: T) => (t.c > 0 && t.s === 0 ? 0 : t.used === 0 ? 1 : 2);
    const cand = [...T].sort((a, b) => rank(a) - rank(b) || byRoom(a, b));
    const chosen: T[] = [];
    let slots = 0;
    for (const t of cand) {
      if (slots >= couples.length) break;
      const p = Math.floor(room(t) / 2);
      if (p > 0) { chosen.push(t); slots += p; }
    }
    unplaced.push(...waterfill(couples, chosen));
  }

  // 2. personnes seules : leurs propres tables ; les tables de couples seulement si nécessaire
  if (singles.length) {
    const coupleTables = T.filter((t) => t.c > 0);
    const singleCand = T.filter((t) => t.c === 0).sort((a, b) => (b.s > 0 ? 1 : 0) - (a.s > 0 ? 1 : 0) || byRoom(a, b));
    const coupleFree = coupleTables.reduce((a, t) => a + room(t), 0);
    const few = singles.length < Math.ceil(cap / 2) && !singleCand.some((t) => t.s > 0) && coupleFree >= singles.length;
    let rest = singles;
    if (few) rest = waterfill(rest, coupleTables);
    else {
      const picked: T[] = [];
      let free = 0;
      for (const t of singleCand) { if (free >= singles.length) break; if (room(t) > 0) { picked.push(t); free += room(t); } }
      rest = waterfill(rest, picked);
      if (rest.length) rest = waterfill(rest, coupleTables);
    }
    unplaced.push(...rest);
  }

  const plan: Plan = {};
  for (const g of todo) plan[g.id] = at[g.id] || 0;
  const problems: string[] = [];
  if (!(cap > 0)) problems.push("Indiquez le nombre de places par table.");
  else if (unplaced.length) {
    const need = persons(unplaced);
    const free = T.reduce((a, t) => a + room(t), 0);
    const uc = unplaced.filter((g) => seats(g) === 2).length;
    if (need > free) problems.push(`${unplaced.length} invitation(s) (${need} personne(s)) restent sans place : il manque ${need - free} place(s). Ajoutez ${Math.ceil((need - free) / cap)} table(s) ou augmentez le nombre de places par table.`);
    else if (uc) problems.push(`${uc} couple(s) restent sans place : aucune table n’a encore 2 places libres côte à côte, et un couple n’est jamais séparé. Ajoutez une table.`);
  }
  const unknownKind = todo.filter((g) => !g.kind).length;
  const tables: SeatingTable[] = T.map((t) => ({ n: t.n, guests: t.guests, used: t.used, free: room(t), couples: t.c / 2, singles: t.s, mixed: t.c > 0 && t.s > 0 }));
  return { plan, tables, unplaced, problems, placed: todo.length - unplaced.length, kept, mixedTables: tables.filter((t) => t.mixed).length, unknownKind };
}

// ---------------- formule d'appel de l'invitation ----------------
const CIVILITY = /^(?:(?:monsieur|m|mr|mme|madame|mlle|mademoiselle)\.?\s+(?:et|&)\s+(?:monsieur|m|mr|mme|madame|mlle|mademoiselle)\.?|monsieur|m\.?|mr\.?|madame|mme\.?|mademoiselle|mlle\.?|couple|famille|les|le couple)\s+/i;
const TITLE = /^(docteur|dr\.?|professeur|pr\.?|ma[iî]tre|me|pasteur|abb[ée]|p[èe]re|r[ée]v[ée]rend|honorable|son excellence|g[ée]n[ée]ral|colonel|chef)\b/i;

/**
 * Formule d'appel selon le statut enregistré (Monsieur, Madame, Couple), jamais déduite du prénom.
 * Les civilités déjà présentes dans le nom ne sont pas répétées ; un titre enregistré (Docteur, Maître…) est conservé.
 * Sans nom ni statut : formule neutre.
 */
export function salutation(g: { name: string; kind: GuestKind | null }): string {
  const raw = String(g.name || "").replace(/\s+/g, " ").trim();
  if (!raw) return g.kind === "couple" ? "Chers invités," : g.kind === "mme" ? "Chère Madame," : g.kind === "mr" ? "Cher Monsieur," : "Bonjour,";
  const first = raw.match(/^(\S+)/)?.[1].toLowerCase().replace(/\.$/, "");
  const mlle = first === "mlle" || first === "mademoiselle";
  let bare = raw.replace(CIVILITY, "").trim();
  if (/^(monsieur|madame|mademoiselle|m\.?|mr\.?|mme\.?|mlle\.?|couple|famille|les)$/i.test(bare)) bare = ""; // civilité seule
  if (g.kind === "couple") {
    if (/\s(et|&)\s/i.test(bare)) return `Chers ${bare.replace(/\s&\s/, " et ")},`; // « Marc et Nadia »
    return bare ? `Chers Monsieur et Madame ${bare},` : "Chers Monsieur et Madame,";
  }
  if (g.kind === "mr") return TITLE.test(bare) ? `Cher ${bare},` : bare ? `Cher Monsieur ${bare},` : "Cher Monsieur,";
  if (g.kind === "mme") {
    const civ = mlle ? "Mademoiselle" : "Madame";
    return TITLE.test(bare) ? `Chère ${bare},` : bare ? `Chère ${civ} ${bare},` : `Chère ${civ},`;
  }
  return `Bonjour ${raw},`;
}

// ---------------- téléphones ----------------
export function normPhone(raw: unknown, prefix: string): { ok: boolean; value: string; why: string } {
  let s = String(raw ?? "").trim();
  if (!s) return { ok: true, value: "", why: "" };
  if (/^\d+([.,]\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s.replace(",", "."));
    if (isFinite(n)) s = n.toFixed(0);
  }
  s = s.replace(/[^\d+]/g, "");
  const c = String(prefix || "").replace(/\D/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (!s.startsWith("+") && s.startsWith("0") && c) s = "+" + c + s.slice(1);
  else if (!s.startsWith("+") && c) {
    if (s.startsWith(c) && s.length >= c.length + 8) s = "+" + s;
    else if (s.length >= 8 && s.length <= 10) s = "+" + c + s;
  }
  s = s.startsWith("+") ? "+" + s.slice(1).replace(/\+/g, "") : s.replace(/\+/g, "");
  const ok = /^\+\d{8,15}$/.test(s);
  return { ok, value: s, why: ok ? "" : s.startsWith("+") ? "Numéro trop court ou trop long." : "Ajoutez l’indicatif du pays, par exemple +243 81 234 5678." };
}

// ---------------- import de listes ----------------
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function splitRows(text: string): string[][] {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/^﻿/, "")).filter((l) => l.trim());
  if (!lines.length) return [];
  let best: string | null = null;
  for (const d of ["\t", ";", "|", ","]) {
    const n = lines.filter((l) => l.includes(d)).length;
    if (n > 0 && n >= Math.ceil(lines.length / 2)) {
      best = d;
      break;
    }
  }
  if (!best) {
    let top = 0;
    for (const d of ["\t", ";", "|"]) {
      const n = lines.filter((l) => l.includes(d)).length;
      if (n > top) {
        top = n;
        best = d;
      }
    }
  }
  return lines.map((l) => (best ? l.split(best).map((c) => c.trim().replace(/^"(.*)"$/, "$1")) : [l.trim()]));
}

export function parseKind(v: unknown): GuestKind | "" {
  const s = norm(v).replace(/\./g, "");
  if (/(couple|duo|menage|maries|^2$|deux)/.test(s)) return "couple";
  if (/^(mme|madame|mlle|mademoiselle|femme|f|dame)$/.test(s)) return "mme";
  if (/^(mr|m|monsieur|homme|h|sieur)$/.test(s)) return "mr";
  return "";
}
export function nameKind(name: string): GuestKind | "" {
  const s = norm(name).replace(/\./g, "");
  if (/^(couple|mr et mme|m et mme|monsieur et madame)\b/.test(s)) return "couple";
  if (/^(mme|madame|mlle|mademoiselle)\b/.test(s)) return "mme";
  if (/^(mr|m|monsieur)\b/.test(s)) return "mr";
  return "";
}

export interface ParsedGuest {
  name: string;
  kind: GuestKind | "";
  whatsapp: string;
  table: number;
}
const HDR: Record<string, RegExp> = {
  name: /^(nom|noms|name|invite|invites|guest|personne|appellation)/,
  status: /^(statut|status|civilite|titre|genre|sexe|situation|type)/,
  wa: /^(whatsapp|wa$|tel|telephone|phone|mobile|numero|num)/,
  table: /^table/,
};

export function parseGuests(text: string, prefix: string): { rows: ParsedGuest[]; issues: string[] } {
  let rows = splitRows(text);
  let map: Record<string, number> | null = null;
  const issues: string[] = [];
  if (rows.length > 1 || (rows.length === 1 && rows[0].length > 1)) {
    const h = rows[0].map(norm);
    if (h.length > 1 && h.some((x) => Object.values(HDR).some((r) => r.test(x))) && !h.some((x) => /^\+?\d[\d\s]{6,}$/.test(x))) {
      map = {};
      h.forEach((x, i) => {
        for (const k of Object.keys(HDR)) if (map![k] === undefined && HDR[k].test(x)) map![k] = i;
      });
      rows = rows.slice(1);
    }
  }
  const out: ParsedGuest[] = [];
  const off = map ? 2 : 1;
  rows.forEach((r, idx) => {
    let name = "";
    let kind: GuestKind | "" = "";
    let wa = "";
    let tb = 0;
    if (map) {
      name = r[map.name ?? 0] || "";
      if (map.status !== undefined) kind = parseKind(r[map.status]);
      if (map.wa !== undefined) wa = r[map.wa] || "";
      if (map.table !== undefined) tb = parseInt(String(r[map.table] || "").replace(/\D/g, ""), 10) || 0;
    } else {
      name = r[0] || "";
      for (const c of r.slice(1)) {
        const v = String(c || "").trim();
        if (!v) continue;
        if (parseKind(v)) kind = parseKind(v);
        else if (/^[+()\d][\d\s().\-+]{6,}$/.test(v)) wa = v;
        else if (/^(table\s*)?\d{1,3}$/i.test(v)) tb = parseInt(v.replace(/\D/g, ""), 10);
      }
    }
    name = name.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!name) {
      issues.push(`Ligne ${idx + off} ignorée : nom manquant.`);
      return;
    }
    if (!kind) kind = nameKind(name);
    const ph = normPhone(wa, prefix);
    if (wa && !ph.ok) issues.push(`Ligne ${idx + off} (${name}) : numéro à vérifier. ${ph.why}`);
    if (!kind) issues.push(`Ligne ${idx + off} (${name}) : statut à préciser (Monsieur, Madame ou Couple).`);
    out.push({ name, kind, whatsapp: wa && ph.ok ? ph.value : "", table: tb });
  });
  return { rows: out, issues };
}

/** Lecture d'un fichier .xlsx (zip + XML) sans bibliothèque. `parseXml` = DOMParser côté navigateur. */
export async function xlsxToText(buf: ArrayBuffer, parseXml: (xml: string) => Document, inflate: (raw: Uint8Array) => Promise<string>): Promise<string> {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip");
  const cnt = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const files: Record<string, { meth: number; csz: number; lo: number }> = {};
  const dec = new TextDecoder();
  for (let k = 0; k < cnt; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const meth = dv.getUint16(off + 10, true);
    const csz = dv.getUint32(off + 20, true);
    const nl = dv.getUint16(off + 28, true);
    const xl = dv.getUint16(off + 30, true);
    const cl = dv.getUint16(off + 32, true);
    const lo = dv.getUint32(off + 42, true);
    files[dec.decode(u8.subarray(off + 46, off + 46 + nl))] = { meth, csz, lo };
    off += 46 + nl + xl + cl;
  }
  const read = async (name: string): Promise<string | null> => {
    const f = files[name];
    if (!f) return null;
    const nl = dv.getUint16(f.lo + 26, true);
    const xl = dv.getUint16(f.lo + 28, true);
    const st = f.lo + 30 + nl + xl;
    const raw = u8.subarray(st, st + f.csz);
    return f.meth === 0 ? dec.decode(raw) : inflate(raw);
  };
  const ss: string[] = [];
  const sst = await read("xl/sharedStrings.xml");
  if (sst) {
    const d = parseXml(sst);
    for (const si of Array.from(d.getElementsByTagName("si"))) ss.push(Array.from(si.getElementsByTagName("t")).map((x) => x.textContent || "").join(""));
  }
  const sheets = Object.keys(files).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort((a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0));
  if (!sheets.length) throw new Error("sheet");
  const xml = parseXml((await read(sheets[0])) || "");
  const colIdx = (r: string | null) => {
    const m = /^([A-Z]+)/.exec(r || "");
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const lines: string[] = [];
  for (const row of Array.from(xml.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const t = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0];
      let val = "";
      if (t === "s") val = ss[Number(v?.textContent)] || "";
      else if (t === "inlineStr") val = Array.from(c.getElementsByTagName("t")).map((x) => x.textContent || "").join("");
      else val = v?.textContent || "";
      let i = colIdx(c.getAttribute("r"));
      if (i < 0) i = cells.length;
      cells[i] = String(val).replace(/[\t\r\n]+/g, " ").trim();
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    if (cells.some(Boolean)) lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

// ---------------- préparation à l'envoi ----------------
export const NO_PHOTO = "Aucune photo : ajoutez au moins une photo, elle sert de fond à l’invitation.";
export type Offer = "both" | "drinks" | "food" | "none";
export function readiness(
  ev: EventShape & { offer: Offer; phone_prefix: string; photos?: string[] },
  guests: Guest[],
  g: Guest,
  catalog: { drinks: number; dishes: number },
): string[] {
  const p: string[] = [];
  const tc = tableCount(ev, guests);
  if (!g.name.trim()) p.push("Le nom de l’invité est manquant.");
  if (!g.kind) p.push("Le statut est à préciser : Monsieur, Madame ou Couple.");
  if (!g.whatsapp) p.push("Le numéro WhatsApp n’est pas renseigné.");
  else if (!normPhone(g.whatsapp, ev.phone_prefix).ok) p.push("Le numéro WhatsApp est inexploitable.");
  const t = g.table_no || 0;
  if (!t) p.push("Aucune table n’est attribuée.");
  else if (t > tc) p.push(`La table ${t} n’existe plus.`);
  else {
    const l = loads(ev, guests).find((x) => x.n === t);
    if (l && l.used > ev.table_capacity) p.push(`La table ${t} dépasse sa capacité.`);
  }
  if ((ev.offer === "both" || ev.offer === "drinks") && !catalog.drinks) p.push("Les boissons sont proposées, mais la liste est vide.");
  if ((ev.offer === "both" || ev.offer === "food") && !catalog.dishes) p.push("Les plats sont proposés, mais la liste est vide.");
  // Au moins une photo : elle sert de fond à l'invitation (la base le revérifie dans mark_invitations_sent).
  if (ev.photos && !ev.photos.length) p.push(NO_PHOTO);
  return p;
}

// ---------------- montants ----------------
export function priceCents(personsBilled: number, unitCents = 500, unitPersons = 50): number {
  return Math.ceil(Math.max(personsBilled, 1) / unitPersons) * unitCents;
}
export function formatMoney(cents: number, currency = "USD", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
