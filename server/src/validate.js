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
