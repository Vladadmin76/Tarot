// Единый вид базы: db.query(sql, params) возвращает массив строк.
// Боевая база: Neon по HTTP. Для тестов и разработки: PGlite (Postgres в WASM) из src/db-local.js.
export async function neonDb(url) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return { query: (text, params = []) => sql.query(text, params) };
}
