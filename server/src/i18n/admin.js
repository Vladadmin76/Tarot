// Тексты администрирования на трёх языках. Ответы API отдают коды, подписи берутся отсюда по языку самого помощника.
export const LEVEL_NAMES = {
  ru: { 1: "Наблюдатель", 2: "Помощник", 3: "Старший помощник" },
  en: { 1: "Observer", 2: "Helper", 3: "Senior helper" },
  es: { 1: "Observador", 2: "Ayudante", 3: "Ayudante sénior" },
};
export const ROLE_NAMES = {
  ru: { admin: "Администратор", helper: "Помощник", user: "Пользователь" },
  en: { admin: "Administrator", helper: "Helper", user: "User" },
  es: { admin: "Administrador", helper: "Ayudante", user: "Usuario" },
};
export const ACTION_LABELS = {
  ru: { send_verify: "Отправил письмо подтверждения", send_reset: "Отправил письмо для сброса пароля", change_email: "Сменил почту аккаунта", block: "Заблокировал аккаунт", unblock: "Разблокировал аккаунт", set_role: "Изменил роль" },
  en: { send_verify: "Sent a verification email", send_reset: "Sent a password reset email", change_email: "Changed the account email", block: "Blocked the account", unblock: "Unblocked the account", set_role: "Changed the role" },
  es: { send_verify: "Envió un correo de verificación", send_reset: "Envió un correo para restablecer la contraseña", change_email: "Cambió el correo de la cuenta", block: "Bloqueó la cuenta", unblock: "Desbloqueó la cuenta", set_role: "Cambió el rol" },
};
export const pick = (table, lang) => table[lang] || table.ru;
