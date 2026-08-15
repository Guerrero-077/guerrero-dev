import { createLogger, createPostgresPool, loadConfig, runMigrations } from "@guerrero-dev/infrastructure";

/**
 * `pnpm migrate` — aplica las migraciones pendientes contra DATABASE_URL.
 * Útil para correrlas a mano fuera del arranque de la API (CI, entornos
 * donde no se quiere migrar automáticamente al bootear el proceso).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ name: "migrate" });
  const pool = createPostgresPool(config, logger);

  try {
    await runMigrations(pool, logger);
    logger.info({}, "Migraciones aplicadas correctamente");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
