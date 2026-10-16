import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { localDb } from "../src/db-local.js";
import { consoleProvider } from "../src/email/index.js";

const ORIGIN = "https://tarot.fixtorllc.com";
async function setup(extra = {}) {
  const config = loadConfig({ PUBLIC_URL: ORIGIN, ADMIN_USERNAMES: "Boss, second", PBKDF2_ITERATIONS: "1000", ...extra });
  const db = await localDb();
  const email = consoleProvider({ silent: true });
  const app = createApp({ config, db, email });
  let cookie = "", n = 0;
  const call = async (method, path, body, { origin = ORIGIN, ip, keepCookie = true, ct = "application/json" } = {}) => {
    const headers = { "cf-connecting-ip": ip || "1.1.1." + (++n % 250) };
    if (origin) headers.origin = origin;
    if (ct) headers["content-type"] = ct;
    if (cookie && keepCookie) headers.cookie = cookie;
    const r = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.startsWith("__Host-tarot_session=;") || /Max-Age=0/i.test(sc) ? "" : sc.split(";")[0];
    return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
  };
  const tokenFrom = (m) => new URL(m.text.match(/https?:\/\/\S+/)[0]).searchParams.get("token");
  return { call, db, email, config, tokenFrom, clearCookie: () => { cookie = ""; } };
}
const reg = { login: "Alice", password: "correct horse battery", name: "Алиса", email: "alice@example.com", consent: true, lang: "ru" };

test("регистрация → подтверждение → вход → me → выход", async () => {
  const s = await setup();
  const r = await s.call("POST", "/api/auth/register", reg);
  assert.equal(r.status, 200);
  assert.equal(s.email.outbox.length, 1);
  assert.match(s.email.outbox[0].subject, /Подтвердите/);
  const row = (await s.db.query("SELECT * FROM users"))[0];
  assert.ok(row.password_hash.startsWith("pbkdf2-sha256$1000$"));
  assert.ok(!row.password_hash.includes(reg.password));

  let l = await s.call("POST", "/api/auth/login", { login: "alice", password: reg.password });
  assert.equal(l.status, 403); assert.equal(l.json.error, "email_not_verified");

  const token = s.tokenFrom(s.email.outbox[0]);
  assert.equal((await s.call("POST", "/api/auth/verify", { token })).status, 200);
  assert.equal((await s.call("POST", "/api/auth/verify", { token })).json.error, "invalid_token", "токен одноразовый");

  l = await s.call("POST", "/api/auth/login", { login: "ALICE@example.com", password: reg.password, timezone: "America/Los_Angeles" });
  assert.equal(l.status, 200);
  assert.match(l.headers.get("set-cookie"), /__Host-tarot_session=.+HttpOnly.+Secure.+SameSite=Lax/i);
  assert.equal(l.json.user.role, "user");
  assert.equal((await s.db.query("SELECT timezone FROM users"))[0].timezone, "America/Los_Angeles");

  const me = await s.call("GET", "/api/auth/me");
  assert.equal(me.json.user.login, "Alice"); assert.equal(me.json.user.emailVerified, true);
  assert.equal(me.json.user.password_hash, undefined);

  await s.call("POST", "/api/auth/logout", {});
  assert.equal((await s.call("GET", "/api/auth/me")).status, 401);
  assert.equal((await s.db.query("SELECT count(*)::int n FROM sessions"))[0].n, 0);
});

test("проверка полей и согласия", async () => {
  const s = await setup();
  const r = await s.call("POST", "/api/auth/register", { login: "a", password: "short", name: "", email: "bad", consent: false });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.json.fields).sort(), ["consent", "email", "login", "name", "password"]);
  const w = await s.call("POST", "/api/auth/register", { ...reg, password: "aaaaaaaaaaaa" });
  assert.equal(w.json.fields.password, "password_weak");
  assert.equal((await s.db.query("SELECT count(*)::int n FROM users"))[0].n, 0);
});

test("занятый логин и занятая почта: прямые ошибки, аккаунт не создаётся", async () => {
  const s = await setup();
  await s.call("POST", "/api/auth/register", reg);
  const sent = s.email.outbox.length;
  const l = await s.call("POST", "/api/auth/register", { ...reg, email: "other@example.com" });
  assert.equal(l.status, 409); assert.equal(l.json.error, "login_taken");
  const e = await s.call("POST", "/api/auth/register", { ...reg, login: "Bob", email: "ALICE@example.com" });
  assert.equal(e.status, 409); assert.equal(e.json.error, "email_taken");
  assert.equal((await s.db.query("SELECT count(*)::int n FROM users"))[0].n, 1);
  assert.equal(s.email.outbox.length, sent, "лишних писем нет");
});

async function verified(s, over = {}) {
  const u = { ...reg, ...over };
  await s.call("POST", "/api/auth/register", u);
  await s.call("POST", "/api/auth/verify", { token: s.tokenFrom(s.email.outbox.at(-1)) });
  return u;
}

test("вход: одинаковая ошибка для неверного пароля и неизвестного логина", async () => {
  const s = await setup(); await verified(s);
  const a = await s.call("POST", "/api/auth/login", { login: "alice", password: "wrong password!" });
  const b = await s.call("POST", "/api/auth/login", { login: "nobody", password: "wrong password!" });
  assert.equal(a.status, 401); assert.deepEqual(a.json, b.json);
});

test("ограничение попыток входа по логину", async () => {
  const s = await setup(); await verified(s);
  for (let i = 0; i < 5; i++) assert.equal((await s.call("POST", "/api/auth/login", { login: "alice", password: "bad bad bad bad" })).status, 401);
  assert.equal((await s.call("POST", "/api/auth/login", { login: "alice", password: reg.password })).status, 429);
});

test("ограничение регистраций с одного IP", async () => {
  const s = await setup();
  for (let i = 0; i < 5; i++) await s.call("POST", "/api/auth/register", { ...reg, login: "user" + i, email: `u${i}@example.com` }, { ip: "9.9.9.9" });
  assert.equal((await s.call("POST", "/api/auth/register", { ...reg, login: "user9", email: "u9@example.com" }, { ip: "9.9.9.9" })).status, 429);
});

test("сброс пароля: письмо, смена, старые сессии закрыты, токен одноразовый", async () => {
  const s = await setup(); await verified(s);
  await s.call("POST", "/api/auth/login", { login: "alice", password: reg.password });
  const before = s.email.outbox.length;
  const f1 = await s.call("POST", "/api/auth/forgot", { email: "alice@example.com" });
  const f2 = await s.call("POST", "/api/auth/forgot", { email: "ghost@example.com" });
  assert.deepEqual(f1.json, f2.json);
  assert.equal(s.email.outbox.length, before + 1);
  const token = s.tokenFrom(s.email.outbox.at(-1));
  assert.equal((await s.call("POST", "/api/auth/reset", { token, password: "short" })).json.error, "password_short");
  assert.equal((await s.call("POST", "/api/auth/reset", { token, password: "brand new passphrase" })).status, 200);
  assert.equal((await s.call("POST", "/api/auth/reset", { token, password: "another passphrase 1" })).json.error, "invalid_token");
  assert.equal((await s.call("GET", "/api/auth/me")).status, 401, "старая сессия закрыта");
  assert.equal((await s.call("POST", "/api/auth/login", { login: "alice", password: reg.password })).status, 401);
  assert.equal((await s.call("POST", "/api/auth/login", { login: "alice", password: "brand new passphrase" })).status, 200);
});

test("просроченный токен не работает", async () => {
  const s = await setup();
  await s.call("POST", "/api/auth/register", reg);
  const token = s.tokenFrom(s.email.outbox[0]);
  await s.db.query("UPDATE email_tokens SET expires_at = now() - interval '1 minute'");
  assert.equal((await s.call("POST", "/api/auth/verify", { token })).json.error, "invalid_token");
  const before = s.email.outbox.length;
  await s.call("POST", "/api/auth/resend", { email: "alice@example.com" });
  assert.equal(s.email.outbox.length, before + 1);
  assert.equal((await s.call("POST", "/api/auth/verify", { token: s.tokenFrom(s.email.outbox.at(-1)) })).status, 200);
});

test("смена пароля и удаление аккаунта", async () => {
  const s = await setup(); await verified(s);
  await s.call("POST", "/api/auth/login", { login: "alice", password: reg.password });
  assert.equal((await s.call("POST", "/api/auth/change-password", { current: "wrong wrong wrong", password: "new password 12345" })).status, 403);
  assert.equal((await s.call("POST", "/api/auth/change-password", { current: reg.password, password: "new password 12345" })).status, 200);
  assert.equal((await s.call("GET", "/api/auth/me")).status, 200, "текущая сессия остаётся");
  assert.equal((await s.call("POST", "/api/auth/delete", { password: reg.password })).status, 403);
  assert.equal((await s.call("POST", "/api/auth/delete", { password: "new password 12345" })).status, 200);
  for (const t of ["users", "sessions", "email_tokens"]) assert.equal((await s.db.query(`SELECT count(*)::int n FROM ${t}`))[0].n, 0, t);
  assert.equal((await s.call("POST", "/api/auth/login", { login: "alice", password: "new password 12345" })).status, 401);
});

test("роль администратора берётся из ADMIN_USERNAMES (максимум 5)", async () => {
  const s = await setup(); await verified(s, { login: "boss", email: "b@example.com" });
  const l = await s.call("POST", "/api/auth/login", { login: "BOSS", password: reg.password });
  assert.equal(l.json.user.role, "admin");
  assert.equal((await s.db.query("SELECT role FROM users"))[0].role, "user", "в базе роль не меняется");
  assert.equal(loadConfig({ ADMIN_USERNAMES: "a,b,c,d,e,f,g" }).admins.length, 5);
  await s.db.query("UPDATE users SET role = 'helper'");
  const s2 = await setup(); await verified(s2, { login: "helper1", email: "h@example.com" });
  await s2.db.query("UPDATE users SET role = 'helper'");
  assert.equal((await s2.call("POST", "/api/auth/login", { login: "helper1", password: reg.password })).json.user.role, "helper");
});

test("защита: Origin и только JSON", async () => {
  const s = await setup();
  assert.equal((await s.call("POST", "/api/auth/register", reg, { origin: "https://evil.example" })).status, 403);
  assert.equal((await s.call("POST", "/api/auth/register", reg, { origin: null })).status, 403);
  assert.equal((await s.call("POST", "/api/auth/register", reg, { ct: "text/plain" })).status, 415);
  assert.equal((await s.db.query("SELECT count(*)::int n FROM users"))[0].n, 0);
});

test("страницы для ссылок из писем и заголовок no-store", async () => {
  const s = await setup();
  const app = createApp({ config: s.config, db: s.db, email: s.email });
  for (const p of ["/confirm-email?token=x", "/reset-password?token=x"]) {
    const r = await app.request(p);
    assert.equal(r.status, 200); assert.match(await r.text(), /<button id="go"/);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
});
