import Fastify, { type FastifyInstance } from "fastify";
import { ProjectService } from "@guerrero-dev/application";
import { PostgresProjectRepository, type PgPool } from "@guerrero-dev/infrastructure";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSessionRoutes } from "./routes/sessions.js";

export interface BuildAppOptions {
  pool: PgPool;
}

/**
 * Construye la app Fastify sin arrancarla (sin `listen`). Separado de
 * `index.ts` para que los tests e2e (Fase 3.17) puedan usar
 * `app.inject()` sin abrir un puerto real.
 */
export function buildApp({ pool }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  const projectService = new ProjectService(new PostgresProjectRepository(pool));

  registerHealthRoutes(app, pool);
  registerProjectRoutes(app, projectService);
  registerSessionRoutes(app);

  return app;
}
