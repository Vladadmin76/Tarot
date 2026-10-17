import { Hono } from "hono";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { confirmPage, resetPage } from "./pages.js";

export function createApp({ config, db, email }) {
  const app = new Hono();
  const page = html => c => c.html(html, 200, { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
  app.get("/confirm-email", page(confirmPage()));
  app.get("/reset-password", page(resetPage()));
  app.route("/api/auth", authRoutes({ config, db, email }));
  app.route("/api/admin", adminRoutes({ config, db, email }));
  app.onError((e, c) => { console.error(e); return c.json({ error: "server_error" }, 500); });
  app.notFound(c => c.json({ error: "not_found" }, 404));
  return app;
}
