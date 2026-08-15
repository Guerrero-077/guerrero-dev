import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import {
  createDrizzleClient,
  DrizzleProjectRepository,
  type DrizzleClient,
  type PgPool,
} from "@guerrero-dev/infrastructure";
import type { IProjectRepository } from "@guerrero-dev/application";

declare module "fastify" {
  interface FastifyInstance {
    pgPool: PgPool;
    db: DrizzleClient;
    projectRepository: IProjectRepository;
  }
}

export interface DatabasePluginOptions {
  pool: PgPool;
}

/**
 * Decora la instancia de Fastify con el pool `pg`, el cliente Drizzle y
 * `IProjectRepository`. Usa `fastify-plugin` para que los decorators
 * queden disponibles en la instancia raíz (sin encapsulación).
 */
export default fp<DatabasePluginOptions>(async function databasePlugin(fastify: FastifyInstance, opts) {
  const db = createDrizzleClient(opts.pool);

  fastify.decorate("pgPool", opts.pool);
  fastify.decorate("db", db);
  fastify.decorate("projectRepository", new DrizzleProjectRepository(db));
});
