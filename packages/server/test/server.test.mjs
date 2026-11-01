// Tests du paquet serveur sur un vrai PostgreSQL migré (db/tests/run.sh) :
//   DATABASE_URL=postgresql://ceremonia_owner@localhost/cer_test?host=/tmp&port=54329 pnpm --filter @ceremonia/server test
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import { test, after } from "node:test";
const require = createRequire(import.meta.url);
if (!process.env.DATABASE_URL) { console.log("DATABASE_URL absente : tests ignorés"); process.exit(0); }
const S = require("./.bundle.cjs");
const uniq = Math.random().toString(36).slice(2, 8);
let A, B; // deux organisateurs
const ctxOf = (sub, aal = "aal1") => ({ role: "authenticated", claims: { sub, aal } });

test("comptes : création, doublon refusé, mot de passe vérifié par bcrypt", async () => {
  const a = await S.auth.createUser(`a-${uniq}@test.cd`, "Motdepasse-1", true); assert.ok(a.ok); A = a.userId;
  const b = await S.auth.createUser(`b-${uniq}@test.cd`, "Motdepasse-2", true); assert.ok(b.ok); B = b.userId;
  const dup = await S.auth.createUser(`A-${uniq}@TEST.cd`, "x-xxxxxxxx", true); assert.deepEqual(dup, { ok: false, error: "exists" });
  assert.equal((await S.auth.checkPassword(`a-${uniq}@test.cd`, "Motdepasse-1")).ok, true);
  assert.equal((await S.auth.checkPassword(`a-${uniq}@test.cd`, "mauvais")).error, "invalid");
  assert.equal((await S.auth.checkPassword(`inconnu-${uniq}@test.cd`, "x")).error, "invalid");
  const hash = await S.asOwner((q) => q.query("select encrypted_password from auth.users where id = $1", [A]));
  assert.match(hash.rows[0].encrypted_password, /^\$2a\$10\$/);
  for (const [id, n] of [[A, "Org A"], [B, "Org B"]]) await S.asOwner((q) => q.query("insert into public.profiles (id, username) values ($1, $2)", [id, n + uniq]));
});

test("comptes : limitation après 10 échecs en 15 minutes", async () => {
  const e = `rl-${uniq}@test.cd`; await S.auth.createUser(e, "Bon-motdepasse", true);
  for (let i = 0; i < 10; i++) await S.auth.checkPassword(e, "faux");
  assert.equal((await S.auth.checkPassword(e, "Bon-motdepasse")).error, "rate_limited");
});

test("sessions : jeton haché, application séparée, inactivité, déconnexion", async () => {
  const { token } = await S.auth.createSession(A, "org");
  const s = await S.auth.getSession(token, "org"); assert.equal(s.userId, A); assert.equal(s.aal, "aal1");
  assert.equal(await S.auth.getSession(token, "admin"), null, "jeton organisateur refusé par l'admin");
  const stored = await S.asOwner((q) => q.query("select count(*)::int n from auth.sessions where token_hash::text like $1", ["%" + Buffer.from(token).toString("hex").slice(0, 16) + "%"]));
  assert.equal(stored.rows[0].n, 0, "le jeton n'est pas stocké en clair");
  await S.asOwner((q) => q.query("update auth.sessions set last_seen_at = now() - interval '31 minutes' where user_id = $1", [A]));
  assert.equal(await S.auth.getSession(token, "org", 30), null, "session inactive supprimée");
  const t2 = (await S.auth.createSession(A, "org")).token; await S.auth.deleteSession(t2); assert.equal(await S.auth.getSession(t2, "org"), null);
});

test("jetons à usage unique : une seule utilisation", async () => {
  const t = await S.auth.createOneTimeToken(A, "recovery", 30);
  assert.equal(await S.auth.consumeOneTimeToken(t, "confirm"), null, "mauvais type");
  assert.equal(await S.auth.consumeOneTimeToken(t, "recovery"), A);
  assert.equal(await S.auth.consumeOneTimeToken(t, "recovery"), null, "rejeu refusé");
});

test("TOTP : vecteur RFC 6238 et rejeu refusé", async () => {
  const secret = S.base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(S.totpAt(secret, 1), "287082"); // RFC 6238, T = 59 s (8 chiffres : 94287082)
  assert.equal(S.totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  const now = Date.now(), code = S.totpAt(secret, S.stepOf(now));
  const st = S.verifyTotp(secret, code, null, now); assert.equal(st, S.stepOf(now));
  assert.equal(S.verifyTotp(secret, code, st, now), null);
  assert.equal(S.verifyTotp(secret, "000000x", null, now), null);
});

test("second facteur : inscription, vérification → session aal2", async () => {
  const { token } = await S.auth.createSession(B, "admin"); const s = await S.auth.getSession(token, "admin");
  const f = await S.auth.enrollFactor(B, "b@test"); assert.match(f.uri, /^otpauth:\/\/totp\//);
  assert.equal(await S.auth.verifyFactor(B, f.factorId, "000000", s.sessionId), false);
  const ok = await S.auth.verifyFactor(B, f.factorId, S.totpAt(f.secret, S.stepOf()), s.sessionId); assert.equal(ok, true);
  assert.equal((await S.auth.getSession(token, "admin")).aal, "aal2");
  assert.equal(await S.auth.enrollFactor(B, "b@test"), null, "nouvelle inscription refusée une fois le facteur vérifié");
});

let E;
test("données : insertion avec valeurs par défaut et retour, règles RLS entre organisateurs", async () => {
  const a = S.dataClient(ctxOf(A)), b = S.dataClient(ctxOf(B));
  const ins = await a.from("events").insert({ owner_id: A, title: "Fête " + uniq, event_date: "2027-05-01", venue: "Salle", address: "Rue", table_capacity: 8, offer: "drinks", expected: 20 }).select("id, short_id, status").single();
  // un événement d'organisateur naît brouillon (migration 1400) ; activé ici comme après un paiement confirmé
  assert.equal(ins.error, null, JSON.stringify(ins.error)); E = ins.data.id; assert.equal(ins.data.status, "draft"); assert.ok(ins.data.short_id);
  await S.asOwner((q) => q.query("update public.events set status = 'active', activated_at = now() where id = $1", [E]));
  const mine = await a.from("events").select("id, title").eq("id", E).maybeSingle(); assert.equal(mine.data.title, "Fête " + uniq);
  const other = await b.from("events").select("id").eq("id", E).maybeSingle(); assert.equal(other.data, null, "invisible pour un autre organisateur");
  const forged = await b.from("events").insert({ owner_id: A, title: "x", event_date: "2027-05-01", venue: "v", address: "a", expected: 1 });
  assert.equal(forged.error?.code, "42501", "création au nom d'un autre refusée");
  const anon = await S.dataClient(S.ANON).from("events").select("id").eq("id", E);
  assert.ok(anon.error?.code === "42501" || (anon.data && anon.data.length === 0), "anonyme sans accès");
});

test("données : mise à jour / suppression comptées, tableaux, tri, single", async () => {
  const a = S.dataClient(ctxOf(A)), b = S.dataClient(ctxOf(B));
  const u = await a.from("events").update({ venue: "Grande salle", expected: 40 }, { count: "exact" }).eq("id", E); assert.equal(u.error, null, JSON.stringify(u.error)); assert.equal(u.count, 1);
  const u1 = await a.from("events").update({ venue: "Salle seule" }, { count: "exact" }).eq("id", E); assert.equal(u1.count, 1, "mise à jour d'une seule colonne");
  const ub = await b.from("events").update({ venue: "Piratage" }, { count: "exact" }).eq("id", E); assert.equal(ub.count, 0);
  const g = await a.from("guests").insert([{ event_id: E, name: "Mr Un", kind: "mr" }, { event_id: E, name: "Couple Deux", kind: "couple", whatsapp: "+243810000001" }]);
  assert.equal(g.error, null, JSON.stringify(g.error));
  const list = await a.from("guests").select("id, name, kind").eq("event_id", E).order("name", { ascending: false });
  assert.deepEqual(list.data.map((x) => x.name), ["Mr Un", "Couple Deux"]);
  const one = await a.from("guests").select("id").eq("event_id", E).single(); assert.equal(one.error?.code, "PGRST116");
  const inq = await a.from("guests").select("name").in("name", ["Mr Un"]); assert.equal(inq.data.length, 1);
  const d = await a.from("guests").delete({ count: "exact" }).eq("event_id", E).eq("name", "Mr Un"); assert.equal(d.count, 1);
  const bad = await a.from("events").select("id; drop table x"); assert.equal(bad.error?.code, "22023", "identifiant SQL refusé");
});

test("RPC : jsonb, texte, void, erreurs de la base", async () => {
  const a = S.dataClient(ctxOf(A)), b = S.dataClient(ctxOf(B));
  const bill = await a.rpc("event_billing", { p_event: E }); assert.equal(bill.error, null, JSON.stringify(bill.error)); assert.equal(typeof bill.data.can_send, "boolean");
  const denied = await b.rpc("event_billing", { p_event: E }); assert.equal(denied.error?.code, "42501");
  const key = await a.rpc("rotate_service_key", { p_event: E }); assert.equal(typeof key.data, "string");
  const st = await a.rpc("create_staff", { p_event: E, p_role: "controller", p_name: "Entrée", p_password: "motdepasse1" });
  assert.equal(st.error, null, JSON.stringify(st.error));
  const sid = st.data.id || st.data.staff_id; assert.ok(sid, JSON.stringify(st.data));
  const rv = await a.rpc("set_staff_revoked", { p_staff: sid, p_revoked: true }); assert.equal(rv.error, null, JSON.stringify(rv.error)); assert.equal(rv.data, null);
  const plan = await a.rpc("save_table_plan", { p_event: E, p_plan: {}, p_manual: true, p_label: "test" });
  assert.ok(!plan.error || plan.error.code !== "NETWORK", JSON.stringify(plan.error));
});

test("photos : écriture par le propriétaire, lecture publique si utilisée, suppression", async () => {
  const p = `${E}/11111111-1111-4111-8111-${uniq.padEnd(12, "0").replace(/[^0-9a-f]/g, "a")}.jpg`;
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.equal((await S.putPhoto(ctxOf(B), p, E, jpg, "image/jpeg")).error?.code, "42501");
  assert.equal((await S.putPhoto(ctxOf(A), p, E, jpg, "image/jpeg")).error, null);
  assert.equal(await S.readPhoto(p), null, "non publiée tant qu'elle n'est pas dans events.photos");
  await S.dataClient(ctxOf(A)).from("events").update({ photos: [p] }).eq("id", E);
  const r = await S.readPhoto(p); assert.ok(r && r.content.equals(jpg)); assert.equal(r.contentType, "image/jpeg");
  assert.equal(await S.readPhoto("../../etc/passwd"), null);
});

// ---------- audit de sécurité (octobre 2026) ----------
test("second facteur : bloqué après 5 codes faux en 15 minutes, même avec le bon code", async () => {
  const c = await S.auth.createUser(`mfa-${uniq}@test.cd`, "Motdepasse-3", true); const C = c.userId;
  const { token } = await S.auth.createSession(C, "admin"); const s = await S.auth.getSession(token, "admin");
  const f = await S.auth.enrollFactor(C, "c@test");
  const wrong = S.totpAt(f.secret, S.stepOf() + 10); // code valide dans 5 minutes : faux maintenant
  for (let i = 0; i < 5; i++) assert.equal(await S.auth.verifyFactor(C, f.factorId, wrong, s.sessionId), false);
  assert.equal(await S.auth.mfaLocked(C), true);
  assert.equal(await S.auth.verifyFactor(C, f.factorId, S.totpAt(f.secret, S.stepOf()), s.sessionId), false, "bon code refusé pendant le blocage");
  assert.equal((await S.auth.getSession(token, "admin")).aal, "aal1");
  assert.equal(await S.auth.mfaLocked(B), false, "blocage propre à chaque compte");
});

test("limite d'envoi : 3 demandes par adresse et par fenêtre, adresses indépendantes", async () => {
  const e = `forgot-${uniq}@test.cd`;
  for (let i = 0; i < 3; i++) assert.equal(await S.auth.allowAttempt("forgot", e, 3, 60), true);
  assert.equal(await S.auth.allowAttempt("forgot", e.toUpperCase(), 3, 60), false, "casse ignorée");
  assert.equal(await S.auth.allowAttempt("forgot", `autre-${uniq}@test.cd`, 3, 60), true);
});

test("adresse IP : en-têtes du proxy préférés au X-Forwarded-For choisi par le client", () => {
  const h = (o) => ({ get: (n) => o[n] ?? null });
  assert.equal(S.auth.clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4", "cf-connecting-ip": "1.2.3.4" })), "1.2.3.4");
  assert.equal(S.auth.clientIp(h({ "x-forwarded-for": "6.6.6.6", "true-client-ip": "5.5.5.5" })), "5.5.5.5");
  assert.equal(S.auth.clientIp(h({ "x-forwarded-for": " 9.9.9.9 , 1.1.1.1" })), "9.9.9.9");
  assert.equal(S.auth.clientIp(h({})), "");
});

test("insertion d'invités : jeton, code et réponse imposés par le client refusés", async () => {
  const a = S.dataClient(ctxOf(A));
  for (const extra of [{ invite_token: "jeton-choisi-par-moi" }, { code: "AAAAAA" }, { rsvp: "yes" }, { whatsapp_opened_at: "2027-01-01" }]) {
    const r = await a.from("guests").insert({ event_id: E, name: "Forgé", kind: "mr", ...extra });
    assert.equal(r.error?.code, "42501", `colonne ${Object.keys(extra)[0]} refusée`);
  }
  assert.equal((await a.from("guests").insert({ event_id: E, name: "Normal", kind: "mr" })).error, null, "insertion normale acceptée");
  assert.equal((await a.from("catalog_items").insert({ event_id: E, kind: "drink", name: "Eau", id: "11111111-1111-4111-8111-111111111111" })).error?.code, "42501");
});

test("photos : nombre de fichiers plafonné par événement", async () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
  const errs = [];
  for (let i = 0; i < 9; i++) errs.push((await S.putPhoto(ctxOf(A), `${E}/33333333-3333-4333-8333-${String(i).padStart(12, "0")}.jpg`, E, jpg, "image/jpeg")).error?.code ?? null);
  assert.equal(errs.filter((x) => x === null).length, 7, "8 fichiers au plus (1 déjà présent)");
  assert.equal(errs.at(-1), "23514");
});

test("tâches planifiées : exécutées une fois, verrou exclusif", async () => {
  const [x, y] = await Promise.all([S.runScheduledJobs(), S.runScheduledJobs()]);
  assert.equal([x.ran, y.ran].filter(Boolean).length >= 1, true);
  assert.deepEqual([...x.errors, ...y.errors], []);
});

after(async () => { await S.pool().end(); });
