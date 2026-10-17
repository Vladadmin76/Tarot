// Локальный сервер: node dev.js  →  http://localhost:8787. Письма печатаются в консоль, база хранится в server/.data.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./src/app.js";
import { loadConfig } from "./src/config.js";
import { localDb } from "./src/db-local.js";
import { consoleProvider } from "./src/email/index.js";

const config = loadConfig({ ENV: "dev", PUBLIC_URL: "http://localhost:8787", ADMIN_USERNAMES: process.env.ADMIN_USERNAMES || "" });
const app = createApp({ config, db: await localDb("./.data"), email: consoleProvider() });
// Сайт из папки dist (сначала bash tools/build_site.sh), чтобы проверять вход в браузере.
app.use("*", serveStatic({ root: "../dist" }));
serve({ fetch: app.fetch, port: 8787 }, i => console.log(`dev-сервер: http://localhost:${i.port}`));
