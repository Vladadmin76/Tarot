// Настройки из переменных окружения (в Cloudflare: vars и secrets).
export function loadConfig(env = {}) {
  const publicUrl = (env.PUBLIC_URL || "http://localhost:8787").replace(/\/+$/, "");
  const admins = (env.ADMIN_USERNAMES || "")
    .split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
    .slice(0, 5); // не больше пяти администраторов
  return {
    publicUrl,
    origin: new URL(publicUrl).origin,
    secureCookies: publicUrl.startsWith("https://"),
    dev: env.ENV === "dev",
    admins,
    emailFrom: env.EMAIL_FROM || "Таро <noreply@fixtorllc.com>",
    resendKey: env.RESEND_API_KEY || "",
    databaseUrl: env.DATABASE_URL || "",
    consentVersion: env.CONSENT_VERSION || "2026-10",
    pbkdf2Iterations: Number(env.PBKDF2_ITERATIONS) || 100000, // предел Cloudflare Workers; формат хеша позволяет повысить позже
  };
}
