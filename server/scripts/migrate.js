// Применяет миграции к боевой базе Neon: DATABASE_URL=... node scripts/migrate.js (запускает владелец).
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { migrationFiles, splitSql } from "../src/db-local.js";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Нужна переменная DATABASE_URL"); process.exit(1); }
const sql = neon(url);
await sql.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
const done = new Set((await sql.query("SELECT name FROM schema_migrations")).map(r => r.name));
for (const f of migrationFiles()) {
  if (done.has(f)) { console.log("уже применена:", f); continue; }
  for (const stmt of splitSql(readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8"))) await sql.query(stmt);
  await sql.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
  console.log("применена:", f);
}
