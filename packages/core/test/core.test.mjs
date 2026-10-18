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
