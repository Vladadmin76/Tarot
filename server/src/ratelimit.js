// Ограничение частоты запросов по ключу (IP, логин, почта) на окне времени. Журнал лежит в базе.
export async function tooMany(db, key, max, windowSec) {
  const r = await db.query("SELECT count(*)::int AS n FROM rate_events WHERE key = $1 AND at > now() - make_interval(secs => $2)", [key, windowSec]);
  return r[0].n >= max;
}
export function hit(db, key) { return db.query("INSERT INTO rate_events (key) VALUES ($1)", [key]); }

// Чистка устаревшего: журнал, сессии, токены, неподтверждённые аккаунты старше 7 дней.
export async function cleanup(db) {
  await db.query("DELETE FROM rate_events WHERE at < now() - interval '1 day'");
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query("DELETE FROM email_tokens WHERE expires_at < now() - interval '1 day'");
  await db.query("DELETE FROM users WHERE email_verified_at IS NULL AND created_at < now() - interval '7 days'");
}
