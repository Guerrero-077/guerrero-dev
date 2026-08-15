import pg from "pg";
import type { ILogger } from "@guerrero-dev/shared";
import type { AppConfig } from "../configuration/config.js";

const { Pool } = pg;
export type PgPool = pg.Pool;

/**
 * Crea el pool de conexión a PostgreSQL a partir de `AppConfig.DATABASE_URL`.
 * Un único pool se comparte entre todos los repositorios de `infrastructure`.
 */
export function createPostgresPool(config: AppConfig, logger?: ILogger): PgPool {
  const pool = new Pool({ connectionString: config.DATABASE_URL });

  pool.on("error", (err) => {
    logger?.error({ err }, "Error inesperado en el pool de PostgreSQL");
  });

  return pool;
}
