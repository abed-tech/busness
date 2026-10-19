// Parcours complet sur un vrai PostgreSQL migré, avec le vrai code serveur des deux applications :
// inscription → profil → événement (8 écrans) → photo → invités → paiement (webhook signé) → envoi → invité → contrôleur
// → API mobile → admin (mot de passe + second facteur). Next.js est remplacé par des stubs (voir stubs.ts).
//   DATABASE_URL=… pnpm test:integration
import { createRequire } from "node:module"; import assert from "node:assert/strict"; import { test, after } from "node:test";
import { createHmac } from "node:crypto"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
if (!process.env.DATABASE_URL) { console.log("DATABASE_URL absente : tests ignorés"); process.exit(0); }
process.env.ORGANIZER_ORIGIN ||= "http://localhost:3000"; process.env.ADMIN_ORIGIN ||= "http://127.0.0.1:3100";
process.env.DEV_PAYMENTS = "1"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_integration"; process.env.DISABLE_SCHEDULER = "1";
const W = require("./.web.cjs"), A = require("./.admin.cjs");
const S = W.server;
const here = path.dirname(fileURLToPath(import.meta.url));
const u = Math.random().toString(36).slice(2, 8);
const email = `org-${u}@test.cd`, pw = "Motdepasse-Org1";
const fdOf = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x)); return f; };
const redirected = async (p) => { try { const r = await p; return { value: r }; } catch (e) { if (e instanceof W.stubs.RedirectError || e?.url) return { url: e.url }; throw e; } };
let EV, GUESTS;

test("organisateur : inscription, confirmation par lien, profil", async () => {
  const s = await W.authActions.signup(null, fdOf({ username: "Org " + u, phone: "+243810000123", email, password: pw, password2: pw }));
  assert.equal(s.ok, true, s.message);
  const notYet = await W.authActions.login(null, fdOf({ email, password: pw }));
  assert.match(notYet.message, /Confirmez/);
  const uid = await S.auth.userIdByEmail(email);
  const tok = await S.auth.createOneTimeToken(uid, "confirm", 60);
  const res = await W.callback.GET(new W.stubs.NextRequest(`http://localhost:3000/auth/callback?type=confirm&token=${tok}`));
  assert.match(res.headers.get("location"), /\/onboarding$/);
  assert.ok(W.stubs.jar.get("cer-org"), "cookie de session posé");
  const r = await redirected(W.onboarding.createProfile(null, fdOf({ username: "Org " + u, full_name: "Organisateur Test", phone: "+243810000123" })));
  assert.equal(r.url, "/events");
  const me = await W.lib.requireOrganizer(); assert.equal(me.email, email); assert.equal(me.status, "active");
});

test("connexion : mauvais mot de passe refusé, bon mot de passe accepté", async () => {
  W.stubs.jar.clear();
  assert.match((await W.authActions.login(null, fdOf({ email, password: "faux" }))).message, /incorrect/);
  const r = await redirected(W.authActions.login(null, fdOf({ email, password: pw, next: "/events" })));
  assert.equal(r.url, "/events"); assert.ok(W.stubs.jar.get("cer-org"));
});

test("événement : création (avec boissons et invités placés automatiquement) → écran photos", async () => {
  const r = await redirected(W.events.createEvent(null, fdOf({
    type: "mariage", host_a: "Marc", host_b: "Nadia", title: "Marc & Nadia " + u, event_date: "2027-06-12", event_time: "17:00",
    venue: "Salle Le Palmier", address: "Gombe", dress: "", message: "Bienvenue", program: "17:00 | Accueil", expected: "0", table_capacity: "4",
    phone_prefix: "+243", offer: "drinks", drinks: "Coca\nEau", guests: "Mr Luc ; Monsieur ; 0810000001\nCouple Bola ; Couple ; +243810000002\nMme Lucie ; Madame ; 0810000003", auto: "on",
  })));
  assert.match(r.url, /^\/events\/[0-9a-f-]{36}\/photos\?new=1$/, JSON.stringify(r));
  EV = r.url.split("/")[2];
  const ev = await W.loadEvent(EV); assert.equal(ev.title, "Marc & Nadia " + u); assert.deepEqual(ev.photos, []);
  const sb = await (await import("node:module")).createRequire(import.meta.url)("./.web.cjs").server.dataClient({ role: "authenticated", claims: { sub: ev.owner_id } });
  const g = await sb.from("guests").select("id, name, kind, table_no, invite_token, code").eq("event_id", EV).order("sort_order");
  assert.equal(g.data.length, 3); assert.ok(g.data.every((x) => x.table_no), "tous placés à table");
  GUESTS = g.data;
});

test("photos : envoi d'un vrai JPEG, lecture publique, dernière photo protégée", async () => {
  const jpg = fs.readFileSync(path.join(here, "fixture.jpg"));
  const up = await W.events.uploadPhotos(null, fdOf({ event_id: EV, photos: new File([jpg], "photo.jpg", { type: "image/jpeg" }) }));
  assert.equal(up.ok, true, up.message);
  const bad = await W.events.uploadPhotos(null, fdOf({ event_id: EV, photos: new File([Buffer.from("GIF89a....")], "x.gif", { type: "image/gif" }) }));
  assert.equal(bad.ok, false);
  const ev = await W.loadEvent(EV); assert.equal(ev.photos.length, 1);
  const res = await W.media.GET(new Request("http://localhost/x"), { params: Promise.resolve({ path: ev.photos[0].split("/") }) });
  assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(jpg), "photo identique à l'envoi");
  const last = await W.events.removePhoto(null, fdOf({ event_id: EV, path: ev.photos[0] }));
  assert.match(last.message, /Gardez au moins une photo/);
});

test("paiement : envoi bloqué avant règlement, webhook Stripe signé, envoi accepté", async () => {
  const before = await W.send.markSent(EV, [GUESTS[0].id]); assert.equal(before.ok, false); assert.match(before.message, /Réglez/);
  const p = await redirected(W.pay.startPayment(null, fdOf({ event_id: EV, method: "card" })));
  const ref = new URL(p.url, "http://x").searchParams.get("ref"); assert.match(ref, /^CRM-/);
  const tx = await S.asOwner((q) => q.query("select amount_cents from public.transactions where reference = $1", [ref]));
  const body = JSON.stringify({ id: "evt_" + u, type: "checkout.session.completed", data: { object: { client_reference_id: ref, payment_status: "paid", amount_total: tx.rows[0].amount_cents, payment_intent: "pi_" + u } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", "whsec_integration").update(`${t}.${body}`).digest("hex")}`;
  const forged = await W.stripe.POST(new Request("http://x", { method: "POST", body, headers: { "stripe-signature": sig.replace(/.$/, "0") } }));
  assert.equal(forged.status, 400, "signature falsifiée refusée");
  const ok = await W.stripe.POST(new Request("http://x", { method: "POST", body, headers: { "stripe-signature": sig } }));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).result, "applied");
  const again = await W.stripe.POST(new Request("http://x", { method: "POST", body, headers: { "stripe-signature": sig } }));
  assert.equal((await again.json()).result, "duplicate", "notification rejouée ignorée");
  const sent = await W.send.markSent(EV, GUESTS.map((g) => g.id)); assert.equal(sent.ok, true, sent.message);
});

test("invité : réponse avec une boisson par personne, couple = 2", async () => {
  const anon = S.dataClient(S.ANON);
  const inv = await anon.rpc("get_invitation", { p_token: GUESTS[1].invite_token });
  assert.equal(inv.error, null, JSON.stringify(inv.error));
  const drinks = inv.data.catalog.filter((c) => c.kind === "drink").map((c) => c.id);
  const r1 = await W.rsvp.submitRsvp(null, fdOf({ token: GUESTS[1].invite_token, answer: "yes", drinks: [drinks[0]] }));
  assert.equal(r1.ok, false, "couple : 2 boissons exigées");
  const r2 = await W.rsvp.submitRsvp(null, fdOf({ token: GUESTS[1].invite_token, answer: "yes", drinks: [drinks[0], drinks[1]] }));
  assert.equal(r2.ok, true, r2.message);
});

test("contrôleur : connexion, QR (CRM2:jeton), entrée validée une seule fois, QR inconnu refusé", async () => {
  const st = await W.staff.createStaff(null, fdOf({ event_id: EV, role: "controller", name: "Entrée " + u, password: "controle1" }));
  assert.equal(st.ok, true, st.message);
  const ev = await W.loadEvent(EV);
  W.stubs.jar.delete("ktok");
  const login = await W.k.kLogin(null, fdOf({ short: ev.short_id, staff: st.created.id, code: st.created.code, password: "controle1" }));
  assert.equal(login.ok, true, login.message);
  const look = await W.k.kLookup(ev.short_id, st.created.id, "CRM2:" + GUESTS[1].invite_token);
  assert.equal(look.ok, true, look.message); assert.equal(look.data.valid, true); assert.equal(look.data.persons, 2);
  const c1 = await W.k.kConfirm(ev.short_id, st.created.id, GUESTS[1].id); assert.equal(c1.data.status, "confirmed");
  const c2 = await W.k.kConfirm(ev.short_id, st.created.id, GUESTS[1].id); assert.equal(c2.data.status, "already");
  const unk = await W.k.kLookup(ev.short_id, st.created.id, "CRM2:inconnu-inconnu-inconnu"); assert.equal(unk.ok, false);
  const notConfirmed = await W.k.kLookup(ev.short_id, st.created.id, GUESTS[0].code); assert.equal(notConfirmed.data?.valid, false, "invité sans réponse : entrée refusée");
});

test("API mobile : connexion par jeton, événements, fonction autorisée, accès refusé sans jeton", async () => {
  const H = { host: "localhost:3000", "content-type": "application/json" };
  const login = await W.apiLogin.POST(new Request("http://localhost:3000/api/v1/auth/login", { method: "POST", headers: H, body: JSON.stringify({ email, password: pw }) }));
  assert.equal(login.status, 201); const { token } = await login.json();
  const evs = await W.apiEvents.GET(new Request("http://localhost:3000/api/v1/events", { headers: { ...H, authorization: `Bearer ${token}` } }));
  assert.equal(evs.status, 200); assert.ok((await evs.json()).data.some((e) => e.id === EV));
  assert.equal((await W.apiEvents.GET(new Request("http://localhost:3000/api/v1/events", { headers: H }))).status, 401);
  const bill = await W.apiRpc.POST(new Request("http://x/api/v1/rpc/event_billing", { method: "POST", headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify({ p_event: EV }) }), { params: Promise.resolve({ fn: "event_billing" }) });
  assert.equal(bill.status, 200); assert.equal((await bill.json()).data.can_send, true);
  const anonBill = await W.apiRpc.POST(new Request("http://x", { method: "POST", headers: H, body: JSON.stringify({ p_event: EV }) }), { params: Promise.resolve({ fn: "event_billing" }) });
  assert.equal(anonBill.status, 403, "anonyme : refusé par la base");
  const admin = await W.apiRpc.POST(new Request("http://x", { method: "POST", headers: H, body: "{}" }), { params: Promise.resolve({ fn: "admin_dashboard" }) });
  assert.equal(admin.status, 404, "fonction d'administration hors liste");
});

// Parcourt l'arbre rendu par un composant serveur (sans React DOM) : éléments, enfants et sous-composants synchrones.
function collect(node, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((n) => collect(n, out)); return out; }
  out.push(node);
  if (typeof node.type === "function" && !node.type.constructor.name.startsWith("Async")) collect(node.type(node.props), out);
  collect(node.props?.children, out);
  return out;
}
const eventsOnPage = async () => {
  const tree = collect(await W.eventsPage({ searchParams: Promise.resolve({}) }));
  assert.ok(!tree.some((n) => n.props?.className === "error-box"), "aucune erreur de chargement affichée");
  return tree.filter((n) => n.props?.e?.id).map((n) => n.props.e);
};

test("Mes événements : les événements réels du compte sont chargés et affichés", async () => {
  const list = await eventsOnPage();
  const mine = list.find((e) => e.id === EV);
  assert.ok(mine, "l'événement créé figure dans la liste");
  assert.equal(mine.title, "Marc & Nadia " + u); assert.equal(mine.venue, "Salle Le Palmier"); assert.equal(mine.photos.length, 1);
});

test("Mes événements : après déconnexion puis reconnexion, retour sur la liste (même avec un autre « next »)", async () => {
  await redirected(W.authActions.logout()); assert.equal(W.stubs.jar.get("cer-org"), undefined);
  assert.equal((await redirected(W.eventsPage({ searchParams: Promise.resolve({}) }))).url, "/login", "non connecté : passage par la connexion");
  const r = await redirected(W.authActions.login(null, fdOf({ email, password: pw, next: `/events/${EV}/guests` })));
  assert.equal(r.url, "/events");
  assert.ok((await eventsOnPage()).some((e) => e.id === EV), "événement toujours affiché après reconnexion");
});

test("Mes événements : un autre compte ne voit pas ces événements ; liste vide sans erreur", async () => {
  const saved = W.stubs.jar.get("cer-org");
  const other = await S.auth.createUser(`autre-${u}@test.cd`, pw, true, { username: "Autre " + u, phone: "" });
  assert.ok(other.ok);
  W.stubs.jar.clear();
  assert.equal((await redirected(W.authActions.login(null, fdOf({ email: `autre-${u}@test.cd`, password: pw })))).url, "/events");
  assert.equal((await redirected(W.eventsPage({ searchParams: Promise.resolve({}) }))).url, "/onboarding", "profil à compléter d'abord");
  assert.equal((await redirected(W.onboarding.createProfile(null, fdOf({ username: "Autre " + u, full_name: "Autre", phone: "" })))).url, "/events");
  const list = await eventsOnPage();
  assert.equal(list.length, 0, "aucun événement d'un autre compte");
  W.stubs.jar.clear(); W.stubs.jar.set("cer-org", saved);
});

test("Suivi de présence : entrées chargées avec le nom de l'invité", async () => {
  const tree = collect(await W.presencePage({ params: Promise.resolve({ id: EV }), searchParams: Promise.resolve({}) }));
  const text = JSON.stringify(tree.map((n) => n.props?.children).filter((c) => typeof c === "string"));
  assert.ok(text.includes(GUESTS[1].name), "nom de l'invité entré affiché");
});

test("suppression d'un événement : confirmation exigée, autre compte refusé, purge réelle, liste à jour", async () => {
  const ev = await W.loadEvent(EV);
  const token = GUESTS[0].invite_token;
  assert.ok((await S.dataClient(S.ANON).rpc("get_invitation", { p_token: token })).data, "invitation ouverte avant suppression");
  // nom mal recopié : refusé, rien n'est supprimé
  const bad = await W.events.deleteEvent(null, fdOf({ event_id: EV, confirm: "pas le bon nom" }));
  assert.equal(bad.ok, false); assert.match(bad.message, /Recopiez exactement/);
  assert.ok((await eventsOnPage()).some((e) => e.id === EV));
  // autre compte (créé plus haut) : refusé par la base
  const saved = W.stubs.jar.get("cer-org");
  W.stubs.jar.clear();
  await redirected(W.authActions.login(null, fdOf({ email: `autre-${u}@test.cd`, password: pw })));
  const other = await W.events.deleteEvent(null, fdOf({ event_id: EV, confirm: ev.title }));
  assert.equal(other.ok, false, "un autre compte ne peut pas supprimer");
  W.stubs.jar.clear(); W.stubs.jar.set("cer-org", saved);
  // propriétaire, nom exact : supprimé, redirection vers la liste
  const r = await redirected(W.events.deleteEvent(null, fdOf({ event_id: EV, confirm: ev.title })));
  assert.equal(r.url, "/events?deleted=1");
  assert.ok(!(await eventsOnPage()).some((e) => e.id === EV), "absent de la liste (rechargement)");
  assert.equal((await S.dataClient(S.ANON).rpc("get_invitation", { p_token: token })).data, null, "lien d'invitation désactivé");
  const left = await S.asOwner((q) => q.query("select (select count(*) from public.guests where event_id = $1)::int as g, (select count(*) from public.event_photo_files where event_id = $1)::int as p, (select count(*) from public.transactions where event_id = $1)::int as t, (select status::text from public.events where id = $1) as s", [EV]));
  assert.deepEqual({ g: left.rows[0].g, p: left.rows[0].p, s: left.rows[0].s }, { g: 0, p: 0, s: "deleted" });
  assert.ok(left.rows[0].t >= 1, "transactions conservées");
  assert.equal((await redirected(W.loadEvent(EV))).url, "404", "page de l'événement introuvable");
});

test("santé : base joignable", async () => {
  const r = await W.health.GET(new Request("http://x/api/health?db=1")); assert.equal(r.status, 200); assert.equal((await r.json()).db, "ok");
});

test("admin : mot de passe + second facteur, organisateur refusé, séparation des espaces", async () => {
  const aEmail = `adm-${u}@test.cd`, aPw = "Motdepasse-Adm1";
  const c = await S.auth.createUser(aEmail, aPw, true);
  await S.asOwner((q) => q.query("insert into public.admin_users (user_id, role, display_name) values ($1, 'super', 'Admin test')", [c.userId]));
  // l'organisateur ne peut pas se connecter à l'admin, l'admin ne peut pas se connecter à l'espace organisateur
  assert.match((await A.authActions.login(null, fdOf({ email, password: pw }))).message, /incorrect/);
  assert.match((await W.authActions.login(null, fdOf({ email: aEmail, password: aPw }))).message, /ne peut pas se connecter ici/);
  const r = await redirected(A.authActions.login(null, fdOf({ email: aEmail, password: aPw })));
  assert.equal(r.url, "/mfa"); assert.ok(A.stubs.jar.get("cer-adm"));
  const noMfa = await redirected(A.lib.requireAdmin()); assert.equal(noMfa.url, "/mfa", "données refusées sans second facteur");
  const en = await A.mfa.startEnroll(); assert.ok(en.enroll?.secret);
  assert.match((await A.mfa.verify(null, fdOf({ factorId: en.enroll.factorId, code: "123456" }))).message || "", /incorrect/);
  const v = await redirected(A.mfa.verify(null, fdOf({ factorId: en.enroll.factorId, code: S.totpAt(en.enroll.secret, S.stepOf()) })));
  assert.equal(v.url, "/");
  const s = await A.lib.requireAdmin("finance.read"); assert.equal(s.role, "super"); assert.ok(s.perms.has("admins.manage"));
  const dash = await A.lib.rpc("admin_dashboard"); assert.equal(dash.ok, true, dash.message);
  await redirected(A.authActions.logout()); assert.equal(A.stubs.jar.get("cer-adm"), undefined);
});

after(async () => { await S.pool().end(); });
