import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ILogger } from "@guerrero-dev/shared";
import type { PgPool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Clave arbitraria para el advisory lock de sesión (ver más abajo). No tiene
// significado especial, solo debe ser estable entre procesos.
const MIGRATIONS_LOCK_KEY = 84_652_371;

/**
 * Runner de migraciones deliberadamente simple: aplica en orden alfabético
 * los .sql de `migrations/` que no estén registrados aún en
 * `schema_migrations`. Suficiente para Fase 3; se puede reemplazar por
 * node-pg-migrate u otra herramienta si el proyecto lo justifica más
 * adelante.
 *
 * `pg_advisory_lock` serializa `runMigrations` entre procesos concurrentes
 * (Fase 4.4: descubierto porque `vitest run tests/integration` corre varios
 * archivos de test en paralelo, cada uno con su propio pool llamando
 * `runMigrations` contra la misma base). Sin el lock, dos procesos podían
 * leer `schema_migrations` vacía al mismo tiempo y ejecutar el mismo SQL en
 * paralelo, chocando contra `pg_type_typname_nsp_index` al crear el mismo
 * tipo/extensión dos veces. Con el lock, el segundo proceso espera a que el
 * primero termine y libere — al llegar su turno, ya no hay nada pendiente.
 */
export async function runMigrations(pool: PgPool, logger?: ILogger): Promise<void> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATIONS_LOCK_KEY]);

    await lockClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await lockClient.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      logger?.info({ file }, "Aplicando migración");

      await lockClient.query("BEGIN");
      try {
        await lockClient.query(sql);
        await lockClient.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await lockClient.query("COMMIT");
      } catch (err) {
        await lockClient.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATIONS_LOCK_KEY]);
    lockClient.release();
  }
}
