// Локальная база для разработки и тестов: PGlite (настоящий Postgres в WASM). dir не задан: в памяти.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIG = fileURLToPath(new URL("../migrations/", import.meta.url));
export const migrationFiles = () => readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
export const splitSql = text => text.split(/^-- statement-break\s*$/m).map(s => s.trim()).filter(Boolean);

export async function localDb(dir) {
  const pg = new PGlite(dir);
  await pg.waitReady;
  for (const f of migrationFiles()) for (const stmt of splitSql(readFileSync(MIG + f, "utf8"))) await pg.query(stmt);
  return { query: async (text, params = []) => (await pg.query(text, params)).rows, close: () => pg.close() };
}
