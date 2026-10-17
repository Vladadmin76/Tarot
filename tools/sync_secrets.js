// Передаёт секреты из GitHub в Worker (пустые пропускает): wrangler secret bulk.
// Запуск в деплое: результат пишется в файл и передаётся в wrangler secret bulk (см. .github/workflows/deploy.yml).
const names = ["DATABASE_URL", "RESEND_API_KEY", "EMAIL_FROM", "ADMIN_USERNAMES"];
const out = {};
for (const n of names) if (process.env[n] && process.env[n].trim()) out[n] = process.env[n].trim();
process.stderr.write(`секреты для передачи: ${Object.keys(out).join(", ") || "нет"}\n`);
process.stdout.write(JSON.stringify(out));
