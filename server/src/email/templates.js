// Тексты писем на трёх языках. kind: verify | reset | changed | deleted
const T = {
  ru: {
    verify: (n, u) => ["Подтвердите почту", `Здравствуйте, ${n}!\n\nЧтобы завершить регистрацию, подтвердите почту по ссылке (действует 24 часа):\n${u}\n\nЕсли вы не регистрировались, просто проигнорируйте письмо.`],
    reset: (n, u) => ["Сброс пароля", `Здравствуйте, ${n}!\n\nЧтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n${u}\n\nЕсли вы не просили сброс, проигнорируйте письмо: пароль не изменится.`],
    changed: (n) => ["Пароль изменён", `Здравствуйте, ${n}!\n\nПароль вашего аккаунта был изменён. Если это были не вы, срочно сбросьте пароль через «Забыли пароль» и напишите в поддержку.`],
    deleted: (n) => ["Аккаунт удалён", `Здравствуйте, ${n}!\n\nВаш аккаунт и данные удалены по вашему запросу.`],
  },
  en: {
    verify: (n, u) => ["Confirm your email", `Hello ${n}!\n\nTo finish signing up, confirm your email using this link (valid for 24 hours):\n${u}\n\nIf you did not sign up, ignore this email.`],
    reset: (n, u) => ["Reset your password", `Hello ${n}!\n\nTo set a new password, open this link (valid for 1 hour):\n${u}\n\nIf you did not ask for this, ignore this email: your password will not change.`],
    changed: (n) => ["Your password was changed", `Hello ${n}!\n\nThe password of your account was changed. If this was not you, reset it right away with "Forgot password" and contact support.`],
    deleted: (n) => ["Account deleted", `Hello ${n}!\n\nYour account and data were deleted at your request.`],
  },
  es: {
    verify: (n, u) => ["Confirma tu correo", `¡Hola, ${n}!\n\nPara terminar el registro, confirma tu correo con este enlace (válido 24 horas):\n${u}\n\nSi no te registraste, ignora este mensaje.`],
    reset: (n, u) => ["Restablecer contraseña", `¡Hola, ${n}!\n\nPara crear una contraseña nueva, abre este enlace (válido 1 hora):\n${u}\n\nSi no lo pediste, ignora este mensaje: tu contraseña no cambiará.`],
    changed: (n) => ["Contraseña cambiada", `¡Hola, ${n}!\n\nSe cambió la contraseña de tu cuenta. Si no fuiste tú, restablécela de inmediato con «Olvidé mi contraseña» y escribe a soporte.`],
    deleted: (n) => ["Cuenta eliminada", `¡Hola, ${n}!\n\nTu cuenta y tus datos fueron eliminados a petición tuya.`],
  },
};
export function render(kind, lang, name, url) {
  const [subject, text] = (T[lang] || T.ru)[kind](name, url);
  return { subject, text };
}
