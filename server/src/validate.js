const COMMON = new Set(["password123", "1234567890", "qwertyuiop", "1q2w3e4r5t", "password1234", "qwerty12345", "0123456789", "iloveyou123", "123456789a", "abcdefghij", "1234512345", "zaq12wsxcde"]);

export function normLogin(s) { return String(s ?? "").trim(); }
export function normEmail(s) { return String(s ?? "").trim(); }

export function checkLogin(login) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(login);
}
export function checkEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && !/\.\./.test(email);
}
export function checkName(name) {
  const n = String(name ?? "").trim();
  return n.length >= 1 && n.length <= 60 && !/[\u0000-\u001f<>]/.test(n);
}
// Минимум 10 знаков (NIST), без обязательных «цифр и заглавных»; отсекаем очевидные пароли.
export function checkPassword(password, { login = "", email = "" } = {}) {
  if (typeof password !== "string") return "password_invalid";
  if (password.length < 10) return "password_short";
  if (password.length > 128) return "password_long";
  const p = password.toLowerCase();
  if (COMMON.has(p) || /^(.)\1+$/.test(p)) return "password_weak";
  if (login && p.includes(login.toLowerCase()) && login.length >= 4) return "password_weak";
  if (email && p === email.toLowerCase()) return "password_weak";
  return null;
}
export const LANGS = ["ru", "en", "es"];
export function checkTimezone(tz) {
  if (typeof tz !== "string" || tz.length > 64) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return null; }
}

// Дата рождения ГГГГ-ММ-ДД: настоящая дата, не раньше 1900 года, не в будущем, возраст не меньше 18 лет.
export const MIN_AGE = 18;
export function checkBirthDate(str, now = new Date()) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return "birth_invalid";
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "birth_invalid";
  const today = now.toISOString().slice(0, 10);
  if (y < 1900 || str > today) return "birth_invalid";
  const cutoff = `${now.getUTCFullYear() - MIN_AGE}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return str > cutoff ? "birth_underage" : null;
}
