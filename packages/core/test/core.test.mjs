// Tests de la logique métier (node --test). Le fichier TS est compilé à la volée par esbuild.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const out = await build({ entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))], bundle: true, format: "esm", write: false, platform: "neutral" });
const tmp = fileURLToPath(new URL("./.core.mjs", import.meta.url));
writeFileSync(tmp, out.outputFiles[0].text);
const C = await import(pathToFileURL(tmp).href);

const ev = (cap, exp = 0, extra = 0) => ({ table_capacity: cap, expected: exp, extra_tables: extra });
const G = (n, kind, t = null) => ({ id: "g" + n, name: "n" + n, kind, table_no: t });

test("150 personnes, 10 par table → 15 tables ; un couple compte 2", () => {
  assert.equal(C.tableCount(ev(10, 150), []), 15);
  assert.equal(C.tableCount(ev(10), [G(1, "couple"), G(2, "mr")]), 1);
  assert.equal(C.tableCount(ev(4), [G(1, "couple"), G(2, "couple"), G(3, "mr")]), 2);
});

test("30 couples + 90 seuls sur 15 tables de 10 : tout le monde placé, aucune table dépassée", () => {
  const gs = [];
  for (let i = 0; i < 30; i++) gs.push(G("c" + i, "couple"));
  for (let i = 0; i < 90; i++) gs.push(G("s" + i, "mr"));
  const r = C.autoAssign(ev(10, 150), gs, { keep: false, strategy: "fill" });
  assert.equal(r.ok, true);
  const load = {};
  for (const g of gs) load[r.plan[g.id]] = (load[r.plan[g.id]] || 0) + C.seats(g);
  assert.equal(Object.keys(load).length, 15);
  assert.ok(Object.values(load).every((v) => v === 10));
});

test("fuzz : 20 000 cas, jamais de dépassement, échec seulement si impossible", () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  let ok = 0;
  for (let it = 0; it < 20000; it++) {
    const cap = 1 + rnd(14), e = ev(cap, rnd(120), rnd(2));
    const n = 1 + rnd(80), gs = [];
    for (let i = 0; i < n; i++) gs.push(G(i, Math.random() < 0.4 ? "couple" : "mme"));
    const keep = Math.random() < 0.5;
    if (keep) {
      const tc = C.tableCount(e, gs), used = Array(tc + 1).fill(0);
      for (const g of gs) if (Math.random() < 0.3) { const t = 1 + rnd(tc), s = C.seats(g); if (used[t] + s <= cap) { used[t] += s; g.table_no = t; } }
    }
    const r = C.autoAssign(e, gs, { keep, strategy: Math.random() < 0.5 ? "fill" : "balance" });
    const tc = C.tableCount(e, gs);
    if (r.ok) {
      ok++;
      const load = {};
      for (const g of gs) { const t = r.plan[g.id]; assert.ok(t >= 1 && t <= tc, "invité non placé ou table inexistante"); load[t] = (load[t] || 0) + C.seats(g); }
      for (const v of Object.values(load)) assert.ok(v <= cap, "capacité dépassée");
    } else {
      // vérifie que c'était vraiment impossible
      const free = Array(tc + 1).fill(cap); free[0] = 0;
      const todo = gs.filter((g) => !(keep && g.table_no));
      if (keep) for (const g of gs) if (g.table_no) free[g.table_no] -= C.seats(g);
      const need = todo.reduce((a, g) => a + C.seats(g), 0), cp = todo.filter((g) => g.kind === "couple").length;
      const tot = free.reduce((a, b) => a + b, 0), room = free.reduce((a, b, i) => (i ? a + Math.floor(b / 2) : a), 0);
      const feasible = need <= tot && cp <= room && !(cap < 2 && gs.some((g) => g.kind === "couple"));
      assert.ok(!feasible, "échec alors qu'une répartition existait : " + JSON.stringify(r.errors));
    }
  }
  assert.ok(ok > 10000);
});

test("échanges : capacité vérifiée sur toutes les tables touchées", () => {
  const gs = [G(1, "couple", 1), G(2, "mr", 1), G(3, "mr", 2), G(4, "mme", 2), G(5, "mr", 2)];
  const e = ev(3);
  assert.deepEqual(C.checkMoves(e, gs, { g3: 1 }), ["La table 1 aurait 4 personnes pour 3 places."]);
  assert.deepEqual(C.checkMoves(e, gs, { g2: 2 }), ["La table 2 aurait 4 personnes pour 3 places."]);
  assert.deepEqual(C.checkMoves(e, gs, { g2: 2, g3: 1 }), [], "échange 1 contre 1 valide");
  assert.deepEqual(C.checkMoves(e, gs, { g1: 2 }), ["La table 2 aurait 5 personnes pour 3 places."], "couple déplacé comme une unité de 2");
});

test("import : Excel/CSV, statuts, numéros", () => {
  const r = C.parseGuests("Nom;Statut;WhatsApp;Table\nMme Hélène;Madame;0812223344;\nCouple Bola;Couple;243810000002;3\nPasteur Simon;;810000004;", "+243");
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows[0], { name: "Mme Hélène", kind: "mme", whatsapp: "+243812223344", table: 0 });
  assert.equal(r.rows[1].whatsapp, "+243810000002");
  assert.equal(r.rows[1].table, 3);
  assert.equal(r.rows[2].kind, "");
  assert.equal(r.rows[2].whatsapp, "+243810000004");
  assert.ok(r.issues.some((i) => i.includes("statut à préciser")));
  const r2 = C.parseGuests("Mr Luc\nCouple Bola ; couple ; 0810000001\nMme Lucie", "+243");
  assert.deepEqual(r2.rows.map((x) => x.kind), ["mr", "couple", "mme"]);
  assert.equal(C.normPhone("2.43810000001E11", "+243").value, "+243810000001");
});

test("préparation à l'envoi", () => {
  const e = { ...ev(10), offer: "both", phone_prefix: "+243" };
  const g = { id: "a", name: "Mr Luc", kind: "mr", table_no: 1, whatsapp: "+243810000001" };
  assert.deepEqual(C.readiness(e, [g], g, { drinks: 1, dishes: 1 }), []);
  assert.equal(C.readiness(e, [g], { ...g, kind: null, table_no: null }, { drinks: 0, dishes: 1 }).length, 3);
  // au moins une photo
  assert.deepEqual(C.readiness({ ...e, photos: [] }, [g], g, { drinks: 1, dishes: 1 }), [C.NO_PHOTO]);
  assert.deepEqual(C.readiness({ ...e, photos: ["x/1.jpg"] }, [g], g, { drinks: 1, dishes: 1 }), []);
});

test("tarif : 5 $ par tranche de 50 personnes", () => {
  assert.equal(C.priceCents(1), 500);
  assert.equal(C.priceCents(50), 500);
  assert.equal(C.priceCents(51), 1000);
});

// ---------------- placement proposé (planSeating) ----------------
const many = (n, kind, p = kind) => Array.from({ length: n }, (_, i) => G(p + i, kind));
const tablesOf = (r) => r.tables.filter((t) => t.guests.length);
function invariants(e, gs, r, keep = false) {
  const cap = e.table_capacity, tc = C.tableCount(e, gs);
  const ids = r.tables.flatMap((t) => t.guests.map((g) => g.id));
  assert.equal(new Set(ids).size, ids.length, "invité placé deux fois");
  assert.equal(ids.length + r.unplaced.length, gs.length, "invité oublié");
  for (const t of r.tables) {
    assert.ok(t.n >= 1 && t.n <= tc);
    assert.ok(t.used <= cap, "capacité dépassée");
    assert.equal(t.used, t.guests.reduce((a, g) => a + C.seats(g), 0));
  }
  for (const [id, n] of Object.entries(r.plan)) {
    const t = r.tables.find((x) => x.guests.some((g) => g.id === id));
    assert.equal(n, t ? t.n : 0, "plan et aperçu différents");
  }
  if (!keep) assert.equal(Object.keys(r.plan).length, gs.length);
  if (r.unplaced.length) assert.ok(r.problems.length, "invités sans place sans explication");
}

test("placement : uniquement des couples, regroupés et équilibrés", () => {
  const gs = many(12, "couple"), e = ev(10);
  const r = C.planSeating(e, gs, { keep: false });
  invariants(e, gs, r);
  assert.equal(r.unplaced.length, 0);
  assert.deepEqual(tablesOf(r).map((t) => t.used), [8, 8, 8]);
});

test("placement : uniquement des personnes seules, le moins de tables possible, équilibré", () => {
  const gs = many(25, "mr"), e = ev(10);
  const r = C.planSeating(e, gs, { keep: false });
  invariants(e, gs, r);
  assert.deepEqual(tablesOf(r).map((t) => t.used).sort(), [8, 8, 9]);
  assert.equal(r.mixedTables, 0);
});

test("placement : mélange possible sans mixité → couples et personnes seules à des tables séparées", () => {
  const gs = [...many(10, "couple"), ...many(9, "mme"), ...many(1, "mr", "x")], e = ev(10, 0, 1); // 30 personnes, 4 tables
  const r = C.planSeating(e, gs, { keep: false });
  invariants(e, gs, r);
  assert.equal(r.unplaced.length, 0);
  assert.equal(r.mixedTables, 0, "aucune table mixte quand ce n'est pas nécessaire");
  for (const t of tablesOf(r)) assert.ok(t.couples === 0 || t.singles === 0);
});

test("placement : tables justes → mixité seulement là où c'est nécessaire", () => {
  const gs = [...many(7, "couple"), ...many(13, "mr")], e = ev(10); // 27 personnes, 3 tables
  const r = C.planSeating(e, gs, { keep: false });
  invariants(e, gs, r);
  assert.equal(r.unplaced.length, 0);
  assert.ok(r.mixedTables >= 1 && r.mixedTables <= 2);
  assert.ok(tablesOf(r).some((t) => t.couples === 0), "une table reste réservée aux personnes seules");
});

test("placement : trop peu de personnes seules pour une table → elles rejoignent les couples", () => {
  const gs = [...many(6, "couple"), ...many(2, "mme")], e = ev(10, 0, 1);
  const r = C.planSeating(e, gs, { keep: false });
  invariants(e, gs, r);
  assert.equal(tablesOf(r).length, 2);
  assert.ok(!tablesOf(r).some((t) => t.couples === 0), "pas de table de 2 personnes seules");
});

test("placement : tables déjà complètes et places restantes insuffisantes → restants listés et expliqués", () => {
  // 2 tables de 4 ; placements gardés : 3 personnes à la table 1, 1 à la table 2 → il reste 1 + 3 places
  const kept = [...many(3, "mme", "k1").map((g) => ({ ...g, table_no: 1 })), { ...G("k2", "mr"), table_no: 2 }];
  const gs = [...kept, ...many(2, "couple")];
  const e = ev(4);
  const r = C.planSeating(e, gs, { keep: true });
  invariants(e, gs, r, true);
  assert.equal(r.kept, 4);
  assert.equal(r.unplaced.length, 1, "un couple sans place, l'autre placé à la table 2");
  assert.equal(r.tables[1].used, 3);
  assert.match(r.problems[0], /côte à côte/);
  for (const g of kept) assert.ok(!(g.id in r.plan), "placement conservé non modifié");
});

test("placement : couples sans 2 places côte à côte → jamais séparés, expliqué", () => {
  const gs = many(5, "couple"), e = ev(5); // 10 personnes, 2 tables de 5 → 4 emplacements de couple
  const r = C.planSeating(e, gs, { keep: false });
  invariants(e, gs, r);
  assert.equal(r.unplaced.length, 1);
  assert.match(r.problems.join(" "), /couple/);
});

test("placement : fuzz 20 000 cas, invariants toujours respectés, complet dès que c'est possible", () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  for (let it = 0; it < 20000; it++) {
    const cap = 1 + rnd(14), e = ev(cap, rnd(120), rnd(3));
    const gs = Array.from({ length: 1 + rnd(80) }, (_, i) => G(i, Math.random() < 0.4 ? "couple" : Math.random() < 0.1 ? null : "mr"));
    const keep = Math.random() < 0.5;
    if (keep) {
      const tc = C.tableCount(e, gs), used = Array(tc + 1).fill(0);
      for (const g of gs) if (Math.random() < 0.3) { const t = 1 + rnd(tc), s = C.seats(g); if (used[t] + s <= cap) { used[t] += s; g.table_no = t; } }
    }
    const r = C.planSeating(e, gs, { keep });
    invariants(e, gs, r, keep);
    if (!keep && cap >= 2) {
      const tc = C.tableCount(e, gs), cp = gs.filter((g) => g.kind === "couple").length;
      if (cp <= tc * Math.floor(cap / 2) && C.persons(gs) <= tc * cap) assert.equal(r.unplaced.length, 0, "placement incomplet alors que possible");
    }
  }
});

// ---------------- formule d'appel ----------------
test("formule d'appel : couple, homme, femme, titres, civilités non répétées, cas neutres", () => {
  const s = (name, kind) => C.salutation({ name, kind });
  assert.equal(s("Mr et Mme Kabila", "couple"), "Chers Monsieur et Madame Kabila,");
  assert.equal(s("M. et Mme Kabila", "couple"), "Chers Monsieur et Madame Kabila,");
  assert.equal(s("Couple Bola", "couple"), "Chers Monsieur et Madame Bola,");
  assert.equal(s("Famille Mbuyi", "couple"), "Chers Monsieur et Madame Mbuyi,");
  assert.equal(s("Marc et Nadia", "couple"), "Chers Marc et Nadia,");
  assert.equal(s("Marc & Nadia", "couple"), "Chers Marc et Nadia,");
  assert.equal(s("Mr Luc Mbuyi", "mr"), "Cher Monsieur Luc Mbuyi,");
  assert.equal(s("Monsieur Luc", "mr"), "Cher Monsieur Luc,");
  assert.equal(s("Luc Mbuyi", "mr"), "Cher Monsieur Luc Mbuyi,");
  assert.equal(s("Mme Lucie", "mme"), "Chère Madame Lucie,");
  assert.equal(s("Mlle Lucie", "mme"), "Chère Mademoiselle Lucie,");
  assert.equal(s("Dr Kabila", "mr"), "Cher Dr Kabila,");
  assert.equal(s("Pasteur Simon", "mr"), "Cher Pasteur Simon,");
  assert.equal(s("Marie", "mme"), "Chère Madame Marie,", "statut enregistré, pas déduit du prénom");
  assert.equal(s("Pasteur Simon", null), "Bonjour Pasteur Simon,");
  assert.equal(s("", "mr"), "Cher Monsieur,");
  assert.equal(s("  ", null), "Bonjour,");
  assert.equal(s("Monsieur", "mr"), "Cher Monsieur,");
});
