import { render } from "./templates.js";

// Консольный провайдер: письма не уходят, а печатаются и копятся в outbox (для разработки и тестов).
export function consoleProvider({ silent = false } = {}) {
  const outbox = [];
  return { outbox, async send(m) { outbox.push(m); if (!silent) console.log(`\n--- письмо для ${m.to}\n${m.subject}\n${m.text}\n---`); } };
}

// Resend: https://resend.com/docs/api-reference/emails/send-email. Нужен подтверждённый домен отправителя.
export function resendProvider({ apiKey, from }) {
  return {
    async send(m) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    },
  };
}

export function makeEmail(config) {
  return config.resendKey ? resendProvider({ apiKey: config.resendKey, from: config.emailFrom }) : consoleProvider();
}

// Отправка по шаблону. Ошибка отправки не должна ломать ответ (человек может запросить письмо повторно).
export async function sendTemplate(provider, kind, user, url) {
  const { subject, text } = render(kind, user.lang, user.name, url);
  try { await provider.send({ to: user.email, subject, text }); } catch (e) { console.error("email failed:", e.message); }
}
