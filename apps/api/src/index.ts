import { createLogger, createPostgresPool, loadConfig, runMigrations } from "@guerrero-dev/infrastructure";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ name: "api" });
  const pool = createPostgresPool(config, logger);

  try {
    await runMigrations(pool, logger);
  } catch (err) {
    logger.error(
      { err },
      "No se pudieron aplicar las migraciones al arrancar — /health/ready reportará error hasta que PostgreSQL esté disponible",
    );
  }

  const app = buildApp({ pool });

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  logger.info({ port: config.API_PORT, host: config.API_HOST }, "Guerrero Dev API escuchando");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
