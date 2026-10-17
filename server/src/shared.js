// Общие части для маршрутов: сессия, текущий пользователь, роль, токены писем, ответы.
import { getCookie, setCookie } from "hono/cookie";
import { randomToken, sha256Hex } from "./crypto.js";

export const SESSION_DAYS = 30;

export function shared({ config, db }) {
  const cookieName = config.secureCookies ? "__Host-tarot_session" : "tarot_session";
  const err = (c, status, error, extra = {}) => c.json({ error, ...extra }, status);
  const ipOf = c => c.req.header("cf-connecting-ip") || (c.req.header("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const body = async c => { try { const b = await c.req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; } };

  const isAdminLogin = loginLower => config.admins.includes(loginLower);
  const roleOf = u => isAdminLogin(u.login_lower) ? "admin" : u.role;
  const levelOf = u => roleOf(u) === "helper" ? (u.helper_level || 1) : null;
  const publicUser = u => ({ id: Number(u.id), login: u.login, name: u.name, email: u.email, lang: u.lang, role: roleOf(u), helperLevel: levelOf(u), emailVerified: !!u.email_verified_at, birthDate: u.birth_date || null, createdAt: u.created_at });

  async function newToken(userId, kind, hours) {
    const t = randomToken();
    await db.query("INSERT INTO email_tokens (user_id, kind, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))", [userId, kind, await sha256Hex(t), hours]);
    return t;
  }
  async function startSession(c, userId) {
    const t = randomToken();
    await db.query("INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))", [userId, await sha256Hex(t), (c.req.header("user-agent") || "").slice(0, 200), SESSION_DAYS]);
    setCookie(c, cookieName, t, { httpOnly: true, secure: config.secureCookies, sameSite: "Lax", path: "/", maxAge: SESSION_DAYS * 86400 });
  }
  // Заблокированный пользователь сессии не получает, даже если старая запись осталась.
  async function currentUser(c) {
    const t = getCookie(c, cookieName);
    if (!t) return null;
    const r = await db.query("SELECT u.*, s.id AS session_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND u.blocked_at IS NULL", [await sha256Hex(t)]);
    return r[0] || null;
  }
  const verifyLink = t => `${config.publicUrl}/confirm-email?token=${t}`;
  const resetLink = t => `${config.publicUrl}/reset-password?token=${t}`;

  // Защита от подделки запросов с чужих сайтов: только JSON и только со своего адреса (плюс cookie SameSite=Lax).
  const guard = async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (!(c.req.header("content-type") || "").includes("application/json")) return err(c, 415, "json_only");
      const o = c.req.header("origin");
      if (o ? o !== config.origin : !config.dev) return err(c, 403, "bad_origin");
    }
    c.header("Cache-Control", "no-store");
    await next();
  };

  return { cookieName, err, ipOf, body, isAdminLogin, roleOf, levelOf, publicUser, newToken, startSession, currentUser, verifyLink, resetLink, guard };
}
