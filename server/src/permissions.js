// Права по уровням помощника (таблица в AUTH-RULES.md). Администратор (логин из ADMIN_USERNAMES) может всё.
const L1 = ["view", "log_own"];
const L2 = [...L1, "send_verify", "send_reset"];
const L3 = [...L2, "see_payments", "change_email", "block", "log_helpers"];
const LEVELS = { 1: L1, 2: L2, 3: L3 };
export const ADMIN_ONLY = ["manage_roles", "log_all", "delete_users"];
export const ALL = [...L3, ...ADMIN_ONLY];

export function permsOf(role, level) {
  if (role === "admin") return ALL;
  if (role === "helper") return LEVELS[level] || L1;
  return [];
}
export const can = (role, level, flag) => permsOf(role, level).includes(flag);
