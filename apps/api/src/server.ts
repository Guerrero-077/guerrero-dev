import Fastify, { type FastifyInstance } from "fastify";
import { AddProject, GetProject, ListProjects } from "@guerrero-dev/application";
import type { PgPool } from "@guerrero-dev/infrastructure";
import databasePlugin from "./plugins/database.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSessionRoutes } from "./routes/sessions.js";

export interface BuildServerOptions {
  pool: PgPool;
}

/**
 * Construye y arma la app Fastify (registra el plugin de base de datos y
 * las rutas), sin arrancarla (sin `listen`). Separado de `index.ts` para
 * que los tests e2e usen `app.inject()` sin abrir un puerto real.
 */
export async function buildServer({ pool }: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(databasePlugin, { pool });

  const useCases = {
    addProject: new AddProject(app.projectRepository),
    getProject: new GetProject(app.projectRepository),
    listProjects: new ListProjects(app.projectRepository),
  };

  registerHealthRoutes(app);
  registerProjectRoutes(app, useCases);
  registerSessionRoutes(app);

  return app;
}
