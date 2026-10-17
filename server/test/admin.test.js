import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { localDb } from "../src/db-local.js";
import { consoleProvider } from "../src/email/index.js";
import { hashPassword } from "../src/crypto.js";

const ORIGIN = "https://test.kosmalis.com", PW = "correct horse battery";
async function setup() {
  const config = loadConfig({ PUBLIC_URL: ORIGIN, ADMIN_USERNAMES: "boss", PBKDF2_ITERATIONS: "1000" });
  const db = await localDb(), email = consoleProvider({ silent: true }), app = createApp({ config, db, email });
  const hash = await hashPassword(PW, 1000);
  const add = async (login, { role = "user", level = null, lang = "ru" } = {}) =>
    (await db.query("INSERT INTO users (login, login_lower, email, email_lower, name, password_hash, email_verified_at, role, helper_level, lang, consent_at, consent_version) VALUES ($1,$2,$3,$4,$5,$6, now(), $7,$8,$9, now(),'t') RETURNING id",
      [login, login.toLowerCase(), login + "@example.com", login.toLowerCase() + "@example.com", login, hash, role, level, lang]))[0].id;
  let n = 0;
  const client = () => {
    let cookie = "";
    const call = async (method, path, body) => {
      const headers = { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "2.2.2." + (++n % 250) };
      if (cookie) headers.cookie = cookie;
      const r = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    return { call, login: async (l, pw = PW) => (await call("POST", "/api/auth/login", { login: l, password: pw })) };
  };
  const as = async login => { const c = client(); const r = await c.login(login); assert.equal(r.status, 200, login); return c; };
  return { db, email, add, as, client, config };
}

test("доступ: без входа 401, обычный пользователь 403", async () => {
  const s = await setup(); await s.add("plain");
  assert.equal((await s.client().call("GET", "/api/admin/users")).status, 401);
  const c = await s.as("plain");
  assert.equal((await c.call("GET", "/api/admin/users")).status, 403);
});

test("уровень 1: смотрит, но ничего не меняет; администраторов и помощников не видит", async () => {
  const s = await setup();
  await s.add("obs", { role: "helper", level: 1 }); await s.add("boss"); await s.add("other", { role: "helper", level: 2 });
  const t = await s.add("victim");
  const c = await s.as("obs");
  const list = await c.call("GET", "/api/admin/users");
  assert.deepEqual(list.json.users.map(u => u.login), ["victim"]);
  assert.equal((await c.call("GET", "/api/admin/users?q=BOSS")).json.total, 0);
  const card = await c.call("GET", `/api/admin/users/${t}`);
  assert.equal(card.status, 200); assert.deepEqual(card.json.user.subscription, { available: false });
  assert.equal(card.json.user.password_hash, undefined);
  assert.equal((await c.call("GET", `/api/admin/users/${(await s.db.query("SELECT id FROM users WHERE login='boss'"))[0].id}`)).status, 404);
  for (const [p, b] of [["send-reset"], ["send-verify"], ["change-email", { email: "x@y.zz" }], ["block", {}], ["role", { role: "helper" }]])
    assert.equal((await c.call("POST", `/api/admin/users/${t}/${p}`, b || {})).status, 403, p);
  assert.equal((await s.db.query("SELECT count(*)::int n FROM admin_log"))[0].n, 0);
});

test("уровень 2: письмо сброса, запись в журнале, остальное закрыто", async () => {
  const s = await setup(); await s.add("hlp", { role: "helper", level: 2 });
  const t = await s.add("victim"); const c = await s.as("hlp");
  assert.equal((await c.call("POST", `/api/admin/users/${t}/send-reset`, {})).status, 200);
  assert.equal(s.email.outbox.at(-1).to, "victim@example.com"); assert.match(s.email.outbox.at(-1).subject, /пароля/);
  assert.equal((await c.call("POST", `/api/admin/users/${t}/send-verify`, {})).json.error, "already_verified");
  assert.equal((await c.call("POST", `/api/admin/users/${t}/block`, {})).status, 403);
  assert.equal((await c.call("POST", `/api/admin/users/${t}/change-email`, { email: "n@e.ee" })).status, 403);
  const log = await c.call("GET", "/api/admin/log");
  assert.equal(log.json.entries.length, 1); assert.equal(log.json.entries[0].action, "send_reset"); assert.equal(log.json.entries[0].label, "Отправил письмо для сброса пароля");
});

test("уровень 3: смена почты закрывает сессии и просит подтвердить; блокировка", async () => {
  const s = await setup(); await s.add("sen", { role: "helper", level: 3 });
  const t = await s.add("victim"); const v = await s.as("victim"); const c = await s.as("sen");
  assert.equal((await v.call("GET", "/api/auth/me")).status, 200);
  assert.equal((await c.call("POST", `/api/admin/users/${t}/change-email`, { email: "bad" })).json.error, "email_invalid");
  assert.equal((await c.call("POST", `/api/admin/users/${t}/change-email`, { email: "sen@example.com" })).json.error, "email_taken");
  assert.equal((await c.call("POST", `/api/admin/users/${t}/change-email`, { email: "new@example.com" })).status, 200);
  const to = s.email.outbox.slice(-2).map(m => m.to).sort();
  assert.deepEqual(to, ["new@example.com", "victim@example.com"]);
  assert.equal((await v.call("GET", "/api/auth/me")).status, 401, "старые сессии закрыты");
  assert.equal((await s.client().login("victim")).json.error, "email_not_verified");

  const t2 = await s.add("troll"); const tr = await s.as("troll");
  assert.equal((await c.call("POST", `/api/admin/users/${t2}/block`, { blocked: true })).status, 200);
  assert.equal((await tr.call("GET", "/api/auth/me")).status, 401);
  assert.equal((await s.client().login("troll")).json.error, "account_blocked");
  assert.equal((await c.call("POST", `/api/admin/users/${t2}/block`, { blocked: false })).status, 200);
  assert.equal((await s.client().login("troll")).status, 200);
});

test("администратор: назначает помощников, никто не трогает администраторов", async () => {
  const s = await setup(); await s.add("boss"); await s.add("boss2"); const h = await s.add("hlp", { role: "helper", level: 3 });
  const u = await s.add("newbie"); const boss = await s.as("boss");
  assert.equal((await boss.call("POST", `/api/admin/users/${u}/role`, { role: "helper" })).status, 200);
  let r = (await s.db.query("SELECT role, helper_level FROM users WHERE id=$1", [u]))[0]; assert.deepEqual([r.role, r.helper_level], ["helper", 1]);
  assert.equal((await boss.call("POST", `/api/admin/users/${u}/role`, { role: "helper", level: 3 })).status, 200);
  assert.equal((await boss.call("POST", `/api/admin/users/${u}/role`, { role: "helper", level: 7 })).json.error, "invalid_level");
  assert.equal((await boss.call("GET", "/api/admin/users?role=helper")).json.total, 2);
  const login = await s.client().login("newbie"); assert.equal(login.json.user.helperLevel, 3);
  const boss2 = (await s.db.query("SELECT id FROM users WHERE login='boss2'"))[0].id;
  const bossId = (await s.db.query("SELECT id FROM users WHERE login='boss'"))[0].id;
  assert.equal((await boss.call("POST", `/api/admin/users/${bossId}/block`, {})).status, 403, "себя нельзя");
  const hc = await s.as("hlp");
  assert.equal((await hc.call("POST", `/api/admin/users/${u}/role`, { role: "user" })).status, 403, "помощник уровня 3 роли не меняет");
  assert.equal((await boss.call("POST", `/api/admin/users/${u}/role`, { role: "user" })).status, 200);
  const nb = await s.as("newbie");
  assert.equal((await nb.call("GET", "/api/admin/users")).status, 403, "снятый помощник сразу теряет доступ");
});

test("журнал: свои записи, записи помощников для уровня 3, всё для администратора; язык по помощнику", async () => {
  const s = await setup(); await s.add("boss"); await s.add("l2", { role: "helper", level: 2 }); await s.add("l2b", { role: "helper", level: 2 });
  await s.add("l3", { role: "helper", level: 3, lang: "en" }); const t = await s.add("victim");
  await (await s.as("l2")).call("POST", `/api/admin/users/${t}/send-reset`, {});
  const b = await s.as("l2b"); await b.call("POST", `/api/admin/users/${t}/send-reset`, {});
  assert.equal((await b.call("GET", "/api/admin/log")).json.entries.length, 1, "свои");
  const l3 = await s.as("l3");
  await l3.call("POST", `/api/admin/users/${t}/block`, { blocked: true });
  const e = (await l3.call("GET", "/api/admin/log")).json.entries;
  assert.equal(e.length, 3); assert.equal(e[0].label, "Blocked the account");
  const boss = await s.as("boss");
  await boss.call("POST", `/api/admin/users/${t}/role`, { role: "helper" });
  assert.equal((await boss.call("GET", "/api/admin/log")).json.entries.length, 4);
  assert.equal((await l3.call("GET", "/api/admin/log")).json.entries.length, 3, "записи администратора помощнику не видны");
});

test("справочник и поиск со спецсимволами", async () => {
  const s = await setup(); await s.add("sen", { role: "helper", level: 3, lang: "es" }); await s.add("a_b"); await s.add("axb");
  const c = await s.as("sen");
  const m = (await c.call("GET", "/api/admin/meta")).json;
  assert.equal(m.roleName, "Ayudante"); assert.deepEqual(m.levels.map(l => l.name), ["Observador", "Ayudante", "Ayudante sénior"]);
  assert.ok(m.can.includes("block") && !m.can.includes("manage_roles"));
  assert.deepEqual((await c.call("GET", "/api/admin/users?q=a_b")).json.users.map(u => u.login), ["a_b"], "_ не подстановка");
  assert.equal((await c.call("GET", "/api/admin/users?q=%25")).json.total, 0);
});

test("удаление аккаунта: только администратор, с вводом логина, журнал остаётся", async () => {
  const s = await setup(); await s.add("boss"); await s.add("sen", { role: "helper", level: 3 });
  const t = await s.add("victim"); const v = await s.as("victim");
  const boss = await s.as("boss"), sen = await s.as("sen");
  assert.equal((await sen.call("POST", `/api/admin/users/${t}/delete`, { confirm: "victim" })).status, 403, "даже старший помощник не удаляет");
  assert.equal((await boss.call("POST", `/api/admin/users/${t}/delete`, { confirm: "wrong" })).json.error, "confirm_mismatch");
  assert.equal((await boss.call("POST", `/api/admin/users/${t}/delete`, { confirm: "victim" })).status, 200);
  assert.equal((await s.db.query("SELECT count(*)::int n FROM users WHERE login='victim'"))[0].n, 0);
  assert.equal((await v.call("GET", "/api/auth/me")).status, 401);
  const e = (await boss.call("GET", "/api/admin/log")).json.entries[0];
  assert.equal(e.action, "delete_user"); assert.equal(e.target, "victim"); assert.equal(e.targetId, null);
  const bossId = (await s.db.query("SELECT id FROM users WHERE login='boss'"))[0].id;
  assert.equal((await boss.call("POST", `/api/admin/users/${bossId}/delete`, { confirm: "boss" })).status, 403, "себя нельзя");
});

test("массовая очистка: администраторы и помощники остаются, нужно подтверждение", async () => {
  const s = await setup(); await s.add("boss"); await s.add("hlp", { role: "helper", level: 1 });
  for (const n of ["u1", "u2", "u3"]) await s.add(n);
  const boss = await s.as("boss"), sen = await s.as("hlp");
  assert.equal((await sen.call("POST", "/api/admin/purge-users", { confirm: "DELETE ALL USERS" })).status, 403);
  assert.equal((await boss.call("POST", "/api/admin/purge-users", {})).json.error, "confirm_mismatch");
  assert.equal((await boss.call("POST", "/api/admin/purge-users", { confirm: "DELETE ALL USERS" })).json.deleted, 3);
  assert.deepEqual((await s.db.query("SELECT login FROM users ORDER BY login")).map(r => r.login), ["boss", "hlp"]);
  assert.equal((await boss.call("POST", "/api/admin/purge-users", { confirm: "DELETE ALL USERS", includeHelpers: true })).json.deleted, 1);
  assert.deepEqual((await s.db.query("SELECT login FROM users")).map(r => r.login), ["boss"]);
  assert.equal((await boss.call("GET", "/api/admin/log")).json.entries[0].action, "purge_users");
});
