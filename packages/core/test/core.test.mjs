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

// ---------------- message WhatsApp de l'invitation ----------------
const NB = "\u00a0";
const WED = { type: "mariage", wedding_kind: "coutumier", host_a: "Patrick", host_b: "Grâce", title: "Patrick & Grâce", event_date: "2027-06-12", venue: "Salle Le Prestige", address: "Boulevard du 30 Juin" };
const LINK = "https://skyevenapp.example/i/tok_123";

test("message WhatsApp : couple, exactement le modèle attendu", () => {
  assert.equal(C.inviteMessage(WED, { name: "Couple Bola", kind: "couple" }, LINK),
    "Chers Monsieur et Madame Bola,\n\n" +
    "Nous avons le plaisir de vous inviter au mariage coutumier de Patrick et Grâce, qui aura lieu le samedi 12 juin 2027.\n\n" +
    "Nous serions heureux de vous compter parmi nous pour partager ce moment spécial.\n\n" +
    `Découvrez votre invitation en cliquant sur le lien ci-dessous${NB}:\n\n` +
    LINK + "\n\n" +
    `Au plaisir de vous recevoir${NB}!`);
});

test("message WhatsApp : seule la formule d'appel change selon le statut", () => {
  const body = (m) => m.split("\n\n").slice(1).join("\n\n");
  const couple = C.inviteMessage(WED, { name: "Couple Bola", kind: "couple" }, LINK);
  const mr = C.inviteMessage(WED, { name: "Mr Luc Mbuyi", kind: "mr" }, LINK);
  const mme = C.inviteMessage(WED, { name: "Mme Lucie Kanku", kind: "mme" }, LINK);
  const unk = C.inviteMessage(WED, { name: "Kabongo", kind: null }, LINK);
  assert.ok(mr.startsWith("Cher Monsieur Luc Mbuyi,\n\n"));
  assert.ok(mme.startsWith("Chère Madame Lucie Kanku,\n\n"));
  assert.ok(unk.startsWith("Bonjour Kabongo,\n\n"));
  for (const m of [mr, mme, unk]) assert.equal(body(m), body(couple));
});

test("message WhatsApp : chaque type de mariage est nommé exactement", () => {
  const expected = {
    civil: "au mariage civil", coutumier: "au mariage coutumier", religieux: "au mariage religieux",
    civil_coutumier: "au mariage civil et coutumier", civil_religieux: "au mariage civil et religieux",
    coutumier_religieux: "au mariage coutumier et religieux", civil_coutumier_religieux: "au mariage civil, coutumier et religieux",
  };
  assert.deepEqual(Object.keys(C.WEDDING_KINDS).sort(), Object.keys(expected).sort());
  for (const [k, phrase] of Object.entries(expected)) {
    const m = C.inviteMessage({ ...WED, wedding_kind: k }, { name: "Luc", kind: "mr" }, LINK);
    assert.ok(m.includes(`vous inviter ${phrase} de Patrick et Grâce, qui aura lieu le samedi 12 juin 2027.`), k + " → " + m);
  }
});

test("message WhatsApp : date juste, quel que soit le jour ou le mois", () => {
  assert.equal(C.frLongDate("2027-01-01"), "vendredi 1 janvier 2027");
  assert.equal(C.frLongDate("2026-12-31"), "jeudi 31 décembre 2026");
  assert.equal(C.frLongDate("2027-08-15"), "dimanche 15 août 2027");
  assert.equal(C.frLongDate(""), "");
});

test("message WhatsApp : lien individuel de chaque invité, jamais le lieu ni l'adresse", () => {
  const a = C.inviteMessage(WED, { name: "A", kind: "mr" }, "https://x/i/AAA");
  const b = C.inviteMessage(WED, { name: "B", kind: "mme" }, "https://x/i/BBB");
  assert.ok(a.includes("\n\nhttps://x/i/AAA\n\n") && !a.includes("BBB"));
  assert.ok(b.includes("\n\nhttps://x/i/BBB\n\n") && !b.includes("AAA"));
  for (const m of [a, b]) { assert.ok(!m.includes("Prestige")); assert.ok(!m.includes("Boulevard")); assert.ok(!/\bà \d{2}:\d{2}/.test(m)); }
});

test("message WhatsApp : informations manquantes omises, jamais inventées", () => {
  const g = { name: "Luc", kind: "mr" };
  // mariage enregistré avant le type de mariage : « au mariage », sans type supposé
  assert.ok(C.inviteMessage({ ...WED, wedding_kind: "" }, g, LINK).includes("vous inviter au mariage de Patrick et Grâce, qui aura lieu"));
  assert.ok(C.inviteMessage({ ...WED, wedding_kind: "inconnu" }, g, LINK).includes("vous inviter au mariage de Patrick et Grâce,"));
  // un seul nom, aucun nom
  assert.ok(C.inviteMessage({ ...WED, host_b: "" }, g, LINK).includes("au mariage coutumier de Patrick, qui aura lieu"));
  assert.ok(C.inviteMessage({ ...WED, host_a: " ", host_b: "" }, g, LINK).includes("vous inviter au mariage coutumier, qui aura lieu"));
  // date absente : pas de date inventée
  const noDate = C.inviteMessage({ ...WED, event_date: "" }, g, LINK);
  assert.ok(noDate.includes("au mariage coutumier de Patrick et Grâce.\n\n") && !noDate.includes("aura lieu"));
  // invité sans nom ni statut
  assert.ok(C.inviteMessage(WED, { name: "", kind: null }, LINK).startsWith("Bonjour,\n\n"));
  assert.ok(!/undefined|null/.test(C.inviteMessage({ type: "mariage", event_date: "2027-06-12" }, { name: "", kind: null }, LINK)));
});

test("message WhatsApp : autres types d'événement, sans type de mariage", () => {
  const p = (ev) => C.eventPhrase(ev);
  assert.equal(p({ type: "fiancailles", host_a: "Marc", host_b: "Nadia", wedding_kind: "civil" }), "aux fiançailles de Marc et Nadia");
  assert.equal(p({ type: "anniversaire", host_a: "Mamie Rose" }), "à l’anniversaire de Mamie Rose");
  assert.equal(p({ type: "bapteme", host_a: "Emmanuel" }), "au baptême d’Emmanuel");
  assert.equal(p({ type: "mariage", wedding_kind: "civil", host_a: "Éric", host_b: "Ruth" }), "au mariage civil d’Éric et Ruth");
  assert.equal(p({ type: "mariage", wedding_kind: "religieux", host_a: "Hugo", host_b: "Aline" }), "au mariage religieux d’Hugo et Aline");
  assert.equal(p({ type: "mariage", wedding_kind: "religieux", host_a: "Yannick", host_b: "Aline" }), "au mariage religieux de Yannick et Aline");
  assert.equal(p({ type: "gala", host_a: "Gala Espoir", host_b: "ONG X" }), `au gala «${NB}Gala Espoir${NB}»`);
  assert.equal(p({ type: "conference", host_a: "", title: "Tech Kin" }), `à la conférence «${NB}Tech Kin${NB}»`);
  assert.equal(p({ type: "gala" }), "à notre soirée de gala");
});

test("message WhatsApp : encodage correct dans un lien wa.me (accents, retours à la ligne, espaces insécables)", () => {
  const m = C.inviteMessage(WED, { name: "Mme Hélène", kind: "mme" }, LINK);
  const url = `https://wa.me/243810000001?text=${encodeURIComponent(m)}`;
  assert.ok(!/[\s«»éè’]/.test(url), "aucun caractère brut dans l'URL");
  assert.equal(new URL(url).searchParams.get("text"), m);
});
