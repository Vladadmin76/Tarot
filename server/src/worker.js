// Точка входа Cloudflare Worker: /api/* и страницы писем идут сюда, остальное отдаёт статика (см. wrangler.jsonc, run_worker_first).
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { neonDb } from "./db.js";
import { makeEmail } from "./email/index.js";

let app;
export default {
  async fetch(request, env, ctx) {
    if (!app) {
      const config = loadConfig(env);
      app = createApp({ config, db: await neonDb(config.databaseUrl), email: makeEmail(config) });
    }
    return app.fetch(request, env, ctx);
  },
};
