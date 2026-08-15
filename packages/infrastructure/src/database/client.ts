import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";
import type { PgPool } from "./pool.js";

export type DrizzleClient = NodePgDatabase<typeof schema>;

/** Envuelve el pool `pg` existente con Drizzle — misma conexión, capa de queries tipada. */
export function createDrizzleClient(pool: PgPool): DrizzleClient {
  return drizzle(pool, { schema });
}
