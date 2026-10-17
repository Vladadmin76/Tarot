import { Hono } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import { sha256Hex, hashPassword, verifyPassword, dummyVerify } from "../crypto.js";
import { shared } from "../shared.js";
import { checkLogin, checkEmail, checkName, checkPassword, checkTimezone, normLogin, normEmail, LANGS } from "../validate.js";
import { tooMany, hit, cleanup } from "../ratelimit.js";
import { sendTemplate } from "../email/index.js";

const H = 3600, VERIFY_H = 24, RESET_H = 1;

export function authRoutes({ config, db, email }) {
  const a = new Hono();
  const { cookieName, err, ipOf, body, publicUser, newToken, startSession, currentUser, verifyLink, resetLink, guard } = shared({ config, db });
  a.use("*", guard);

  const consume = async (token, kind) => {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
    const r = await db.query("UPDATE email_tokens SET used_at = now() WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id", [await sha256Hex(token), kind]);
    return r[0] ? r[0].user_id : null;
  };
  const byEmail = async e => (await db.query("SELECT * FROM users WHERE email_lower = $1", [e.toLowerCase()]))[0];

  // ---------- регистрация ----------
  a.post("/register", async c => {
    const b = await body(c), ip = ipOf(c);
    if (await tooMany(db, "reg:" + ip, 5, H)) return err(c, 429, "rate_limited");
    await hit(db, "reg:" + ip);
    const login = normLogin(b.login), mail = normEmail(b.email), name = String(b.name ?? "").trim();
    const fields = {};
    if (!checkLogin(login)) fields.login = "login_invalid";
    if (!checkEmail(mail)) fields.email = "email_invalid";
    if (!checkName(name)) fields.name = "name_invalid";
    const pe = checkPassword(b.password, { login, email: mail }); if (pe) fields.password = pe;
    if (b.consent !== true) fields.consent = "consent_required";
    if (Object.keys(fields).length) return err(c, 400, "invalid", { fields });
    const lang = LANGS.includes(b.lang) ? b.lang : "ru";
    if (Math.random() < 0.02) cleanup(db).catch(() => {});

    if (await byEmail(mail)) return err(c, 409, "email_taken");
    if ((await db.query("SELECT 1 FROM users WHERE login_lower = $1", [login.toLowerCase()])).length) return err(c, 409, "login_taken");
    const hash = await hashPassword(b.password, config.pbkdf2Iterations);
    let u;
    try {
      u = (await db.query("INSERT INTO users (login, login_lower, email, email_lower, name, password_hash, lang, timezone, consent_at, consent_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9) RETURNING *",
        [login, login.toLowerCase(), mail, mail.toLowerCase(), name, hash, lang, checkTimezone(b.timezone), config.consentVersion]))[0];
    } catch (e) { // гонка двух одинаковых регистраций
      if (/unique|duplicate/i.test(e.message)) return err(c, 409, /email/i.test(e.message) ? "email_taken" : "login_taken");
      throw e;
    }
    await sendTemplate(email, "verify", u, verifyLink(await newToken(u.id, "verify", VERIFY_H)));
    return c.json({ ok: true, verify: "sent" });
  });

  a.post("/verify", async c => {
    const ip = ipOf(c);
    if (await tooMany(db, "tok:" + ip, 20, H)) return err(c, 429, "rate_limited");
    await hit(db, "tok:" + ip);
    const uid = await consume((await body(c)).token, "verify");
    if (!uid) return err(c, 400, "invalid_token");
    await db.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [uid]);
    return c.json({ ok: true });
  });

  async function mailLimited(c, kind, ttl, tpl, linkFn, filter) {
    const mail = normEmail((await body(c)).email), ip = ipOf(c);
    if (await tooMany(db, kind + ":ip:" + ip, 5, H)) return err(c, 429, "rate_limited");
    await hit(db, kind + ":ip:" + ip);
    if (checkEmail(mail) && !(await tooMany(db, kind + ":m:" + mail.toLowerCase(), 3, H))) {
      await hit(db, kind + ":m:" + mail.toLowerCase());
      const u = await byEmail(mail);
      if (u && filter(u)) await sendTemplate(email, tpl, u, linkFn(await newToken(u.id, kind === "forgot" ? "reset" : "verify", ttl)));
    }
    return c.json({ ok: true }); // всегда одинаково: нельзя узнать, есть ли такая почта
  }
  a.post("/resend", c => mailLimited(c, "resend", VERIFY_H, "verify", verifyLink, u => !u.email_verified_at));
  a.post("/forgot", c => mailLimited(c, "forgot", RESET_H, "reset", resetLink, () => true));

  a.post("/reset", async c => {
    const b = await body(c), ip = ipOf(c);
    if (await tooMany(db, "tok:" + ip, 20, H)) return err(c, 429, "rate_limited");
    await hit(db, "tok:" + ip);
    const pe = checkPassword(b.password); if (pe) return err(c, 400, pe);
    const uid = await consume(b.token, "reset");
    if (!uid) return err(c, 400, "invalid_token");
    const hash = await hashPassword(b.password, config.pbkdf2Iterations);
    // сброс по ссылке из почты заодно подтверждает почту и выкидывает все старые сессии
    const u = (await db.query("UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING *", [uid, hash]))[0];
    await db.query("DELETE FROM sessions WHERE user_id = $1", [uid]);
    if (u) await sendTemplate(email, "changed", u);
    return c.json({ ok: true });
  });

  // ---------- вход и сессия ----------
  a.post("/login", async c => {
    const b = await body(c), ip = ipOf(c), id = normLogin(b.login).toLowerCase();
    if (!id || typeof b.password !== "string" || b.password.length > 128 || id.length > 254) return err(c, 400, "invalid");
    if (await tooMany(db, "login:ip:" + ip, 20, 900) || await tooMany(db, "login:id:" + id, 5, 900)) return err(c, 429, "rate_limited");
    const u = (await db.query("SELECT * FROM users WHERE login_lower = $1 OR email_lower = $1", [id]))[0];
    const ok = u ? await verifyPassword(b.password, u.password_hash) : await dummyVerify(b.password, config.pbkdf2Iterations);
    if (!ok) { await hit(db, "login:ip:" + ip); await hit(db, "login:id:" + id); return err(c, 401, "bad_credentials"); }
    if (u.blocked_at) return err(c, 403, "account_blocked");
    if (!u.email_verified_at) return err(c, 403, "email_not_verified");
    const tz = checkTimezone(b.timezone);
    if (tz && tz !== u.timezone) { await db.query("UPDATE users SET timezone = $2 WHERE id = $1", [u.id, tz]); u.timezone = tz; }
    await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [u.id]);
    await startSession(c, u.id);
    return c.json({ ok: true, user: publicUser(u) });
  });

  a.post("/logout", async c => {
    const t = getCookie(c, cookieName);
    if (t) await db.query("DELETE FROM sessions WHERE token_hash = $1", [await sha256Hex(t)]);
    deleteCookie(c, cookieName, { path: "/", secure: config.secureCookies });
    return c.json({ ok: true });
  });

  a.get("/me", async c => {
    const u = await currentUser(c);
    return u ? c.json({ user: publicUser(u) }) : err(c, 401, "not_logged_in");
  });

  // ---------- действия вошедшего ----------
  async function authed(c) {
    const u = await currentUser(c);
    if (!u) return [null, err(c, 401, "not_logged_in")];
    if (await tooMany(db, "acct:" + u.id, 10, H)) return [null, err(c, 429, "rate_limited")];
    return [u, null];
  }
  a.post("/change-password", async c => {
    const [u, bad] = await authed(c); if (bad) return bad;
    const b = await body(c);
    if (!(await verifyPassword(String(b.current ?? ""), u.password_hash))) { await hit(db, "acct:" + u.id); return err(c, 403, "bad_credentials"); }
    const pe = checkPassword(b.password, { login: u.login, email: u.email }); if (pe) return err(c, 400, pe);
    await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [u.id, await hashPassword(b.password, config.pbkdf2Iterations)]);
    await db.query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [u.id, u.session_id]); // остальные устройства выходят
    await sendTemplate(email, "changed", u);
    return c.json({ ok: true });
  });

  a.post("/delete", async c => {
    const [u, bad] = await authed(c); if (bad) return bad;
    if (!(await verifyPassword(String((await body(c)).password ?? ""), u.password_hash))) { await hit(db, "acct:" + u.id); return err(c, 403, "bad_credentials"); }
    await db.query("DELETE FROM users WHERE id = $1", [u.id]); // сессии и токены удаляются каскадом
    deleteCookie(c, cookieName, { path: "/", secure: config.secureCookies });
    await sendTemplate(email, "deleted", u);
    return c.json({ ok: true });
  });

  return a;
}
