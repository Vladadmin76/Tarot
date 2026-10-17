import { Hono } from "hono";
import { shared } from "../shared.js";
import { can, permsOf } from "../permissions.js";
import { LEVEL_NAMES, ROLE_NAMES, ACTION_LABELS, pick } from "../i18n/admin.js";
import { checkEmail, normEmail } from "../validate.js";
import { tooMany, hit } from "../ratelimit.js";
import { sendTemplate } from "../email/index.js";

const PAGE = 20, H = 3600;

export function adminRoutes({ config, db, email }) {
  const a = new Hono();
  const S = shared({ config, db });
  const { err, body, roleOf, levelOf, newToken, currentUser, verifyLink, resetLink, guard } = S;
  a.use("*", guard);

  // Вход только для администратора и помощника; каждое действие дополнительно проверяет своё право.
  a.use("*", async (c, next) => {
    const u = await currentUser(c);
    if (!u) return err(c, 401, "not_logged_in");
    const role = roleOf(u);
    if (role !== "admin" && role !== "helper") return err(c, 403, "forbidden");
    if (await tooMany(db, "adm:" + u.id, 300, H)) return err(c, 429, "rate_limited");
    await hit(db, "adm:" + u.id);
    c.set("actor", { u, role, level: levelOf(u), lang: u.lang });
    await next();
  });
  const need = (c, flag) => { const x = c.get("actor"); return can(x.role, x.level, flag) ? null : err(c, 403, "forbidden"); };

  // Кого видит этот человек: администратор всех, помощник только обычных пользователей.
  const hiddenSql = (actor, params) => {
    if (actor.role === "admin") return "TRUE";
    params.push(config.admins);
    return `(u.role = 'user' AND u.login_lower <> ALL($${params.length}::text[]))`;
  };
  async function target(c) {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id < 1) return null;
    const actor = c.get("actor"), params = [id];
    const r = await db.query(`SELECT u.* FROM users u WHERE u.id = $1 AND ${hiddenSql(actor, params)}`, params);
    return r[0] || null;
  }
  const row = (u, lang) => {
    const role = roleOf(u), level = levelOf(u);
    return { id: Number(u.id), login: u.login, name: u.name, email: u.email, emailVerified: !!u.email_verified_at, role, roleName: pick(ROLE_NAMES, lang)[role],
      helperLevel: level, helperLevelName: level ? pick(LEVEL_NAMES, lang)[level] : null, blocked: !!u.blocked_at, createdAt: u.created_at };
  };
  async function log(c, t, action, details) {
    const { u, role } = c.get("actor");
    await db.query("INSERT INTO admin_log (actor_id, actor_login, actor_role, target_id, target_login, action, details) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [u.id, u.login, role, t ? t.id : null, t ? t.login : null, action, details ? JSON.stringify(details) : null]);
  }
  // Администратора (из секрета) не трогает никто, кроме него самого.
  const protectedTarget = (c, t) => roleOf(t) === "admin" || t.id === c.get("actor").u.id;

  // ---- справочник для интерфейса: права и подписи на языке помощника ----
  a.get("/meta", c => {
    const x = c.get("actor");
    return c.json({ role: x.role, roleName: pick(ROLE_NAMES, x.lang)[x.role], helperLevel: x.level, can: permsOf(x.role, x.level),
      levels: Object.entries(pick(LEVEL_NAMES, x.lang)).map(([level, name]) => ({ level: Number(level), name })), actions: pick(ACTION_LABELS, x.lang) });
  });

  // ---- поиск и карточка ----
  a.get("/users", async c => {
    const bad = need(c, "view"); if (bad) return bad;
    const x = c.get("actor"), q = (c.req.query("q") || "").trim().slice(0, 100), page = Math.max(1, Number(c.req.query("page")) || 1);
    const params = [], where = [];
    where.push(hiddenSql(x, params));
    if (q) { params.push("%" + q.replace(/[\\%_]/g, m => "\\" + m).toLowerCase() + "%"); where.push(`(u.login_lower LIKE $${params.length} OR lower(u.name) LIKE $${params.length} OR u.email_lower LIKE $${params.length})`); }
    const role = c.req.query("role");
    if (role === "helper" && x.role === "admin") where.push("u.role = 'helper'");
    const w = where.join(" AND ");
    const total = (await db.query(`SELECT count(*)::int AS n FROM users u WHERE ${w}`, params))[0].n;
    params.push(PAGE, (page - 1) * PAGE);
    const rows = await db.query(`SELECT u.* FROM users u WHERE ${w} ORDER BY u.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return c.json({ total, page, pageSize: PAGE, users: rows.map(u => row(u, x.lang)) });
  });

  a.get("/users/:id", async c => {
    const bad = need(c, "view"); if (bad) return bad;
    const t = await target(c); if (!t) return err(c, 404, "not_found");
    const x = c.get("actor");
    return c.json({ user: { ...row(t, x.lang), lang: t.lang, timezone: t.timezone, birthDate: x.role === "admin" ? t.birth_date || null : undefined, lastLoginAt: t.last_login_at, consentAt: t.consent_at,
      // блок подписки появится вместе с тарифами; суммы платежей позже будут только с права see_payments
      subscription: { available: false } } });
  });

  // ---- письма ----
  const mail = (flag, kind, tpl, ttl, linkFn, action) => async c => {
    const bad = need(c, flag); if (bad) return bad;
    const t = await target(c); if (!t) return err(c, 404, "not_found");
    if (t.blocked_at) return err(c, 409, "blocked");
    if (kind === "verify" && t.email_verified_at) return err(c, 409, "already_verified");
    if (await tooMany(db, `adm-mail:${t.id}`, 3, H)) return err(c, 429, "rate_limited");
    await hit(db, `adm-mail:${t.id}`);
    await sendTemplate(email, tpl, t, linkFn(await newToken(t.id, kind, ttl)));
    await log(c, t, action);
    return c.json({ ok: true });
  };
  a.post("/users/:id/send-verify", mail("send_verify", "verify", "verify", 24, verifyLink, "send_verify"));
  a.post("/users/:id/send-reset", mail("send_reset", "reset", "reset", 1, resetLink, "send_reset"));

  // ---- смена почты (после проверки личности человеком из поддержки) ----
  a.post("/users/:id/change-email", async c => {
    const bad = need(c, "change_email"); if (bad) return bad;
    const t = await target(c); if (!t) return err(c, 404, "not_found");
    if (protectedTarget(c, t)) return err(c, 403, "protected");
    const mailNew = normEmail((await body(c)).email);
    if (!checkEmail(mailNew)) return err(c, 400, "email_invalid");
    if ((await db.query("SELECT 1 FROM users WHERE email_lower = $1 AND id <> $2", [mailNew.toLowerCase(), t.id])).length) return err(c, 409, "email_taken");
    await db.query("UPDATE users SET email = $2, email_lower = $3, email_verified_at = NULL WHERE id = $1", [t.id, mailNew, mailNew.toLowerCase()]);
    await db.query("DELETE FROM sessions WHERE user_id = $1", [t.id]);
    await db.query("DELETE FROM email_tokens WHERE user_id = $1 AND used_at IS NULL", [t.id]);
    await sendTemplate(email, "emailChanged", t, mailNew); // старая почта узнаёт о замене
    await sendTemplate(email, "verify", { ...t, email: mailNew }, verifyLink(await newToken(t.id, "verify", 24)));
    await log(c, t, "change_email", { from: t.email, to: mailNew });
    return c.json({ ok: true });
  });

  // ---- блокировка ----
  a.post("/users/:id/block", async c => {
    const bad = need(c, "block"); if (bad) return bad;
    const t = await target(c); if (!t) return err(c, 404, "not_found");
    if (protectedTarget(c, t)) return err(c, 403, "protected");
    const blocked = (await body(c)).blocked !== false;
    await db.query("UPDATE users SET blocked_at = CASE WHEN $2 THEN COALESCE(blocked_at, now()) ELSE NULL END WHERE id = $1", [t.id, blocked]);
    if (blocked) await db.query("DELETE FROM sessions WHERE user_id = $1", [t.id]);
    await log(c, t, blocked ? "block" : "unblock");
    return c.json({ ok: true });
  });

  // ---- роли: только администратор ----
  a.post("/users/:id/role", async c => {
    const bad = need(c, "manage_roles"); if (bad) return bad;
    const t = await target(c); if (!t) return err(c, 404, "not_found");
    if (protectedTarget(c, t)) return err(c, 403, "protected");
    const b = await body(c);
    if (b.role !== "user" && b.role !== "helper") return err(c, 400, "invalid");
    let level = null;
    if (b.role === "helper") {
      level = b.level === undefined ? (t.role === "helper" ? t.helper_level : 1) : Number(b.level);
      if (![1, 2, 3].includes(level)) return err(c, 400, "invalid_level");
    }
    await db.query("UPDATE users SET role = $2, helper_level = $3 WHERE id = $1", [t.id, b.role, level]);
    await log(c, t, "set_role", { role: b.role, level });
    return c.json({ ok: true });
  });

  // ---- удаление аккаунтов: только администратор ----
  // Аккаунт, сессии и токены удаляются сразу; запись в журнале остаётся (с логином). Администраторов и себя удалить нельзя.
  a.post("/users/:id/delete", async c => {
    const bad = need(c, "delete_users"); if (bad) return bad;
    const t = await target(c); if (!t) return err(c, 404, "not_found");
    if (protectedTarget(c, t)) return err(c, 403, "protected");
    if ((await body(c)).confirm !== t.login) return err(c, 400, "confirm_mismatch"); // нужно ввести логин удаляемого
    await db.query("DELETE FROM users WHERE id = $1", [t.id]);
    await log(c, { id: null, login: t.login }, "delete_user", { email: t.email, role: roleOf(t) });
    return c.json({ ok: true });
  });

  // Массовая очистка (например, перед запуском удалить тестовых пользователей). Администраторы из секрета остаются всегда.
  // По умолчанию помощники тоже остаются; includeHelpers: true удаляет и их. Нужно прислать confirm: "DELETE ALL USERS".
  a.post("/purge-users", async c => {
    const bad = need(c, "delete_users"); if (bad) return bad;
    const b = await body(c);
    if (b.confirm !== "DELETE ALL USERS") return err(c, 400, "confirm_mismatch");
    const roles = b.includeHelpers === true ? ["user", "helper"] : ["user"];
    const r = await db.query("DELETE FROM users WHERE role = ANY($1::text[]) AND login_lower <> ALL($2::text[]) RETURNING id", [roles, config.admins]);
    await log(c, null, "purge_users", { deleted: r.length, includeHelpers: b.includeHelpers === true });
    return c.json({ ok: true, deleted: r.length });
  });

  // ---- журнал: свои записи; старший помощник видит записи помощников; администратор всё ----
  a.get("/log", async c => {
    const bad = need(c, "log_own"); if (bad) return bad;
    const x = c.get("actor"), page = Math.max(1, Number(c.req.query("page")) || 1), params = [];
    let w = "TRUE";
    if (!can(x.role, x.level, "log_all")) {
      params.push(x.u.id);
      w = can(x.role, x.level, "log_helpers") ? `(actor_id = $1 OR actor_role = 'helper')` : "actor_id = $1";
    }
    params.push(PAGE, (page - 1) * PAGE);
    const rows = await db.query(`SELECT * FROM admin_log WHERE ${w} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const labels = pick(ACTION_LABELS, x.lang);
    return c.json({ page, pageSize: PAGE, entries: rows.map(r => ({ id: Number(r.id), at: r.at, actor: r.actor_login, actorRole: r.actor_role, target: r.target_login, targetId: r.target_id && Number(r.target_id),
      action: r.action, label: labels[r.action] || r.action, details: r.details })) });
  });

  return a;
}
