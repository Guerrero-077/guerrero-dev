import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleProjectRepository,
  loadConfig,
  type PgPool,
} from "@guerrero-dev/infrastructure";
import { AddProject, GetProject, ListProjects } from "@guerrero-dev/application";

/**
 * El CLI habla con Application, no con PostgreSQL directamente (Fase
 * 3.10). Este contexto crea el pool + repositorio + casos de uso una vez
 * por invocación de comando, y expone `dispose()` para cerrar la
 * conexión al terminar.
 */
export interface CliContext {
  pool: PgPool;
  addProject: AddProject;
  getProject: GetProject;
  listProjects: ListProjects;
  dispose(): Promise<void>;
}

export function createCliContext(): CliContext {
  const config = loadConfig();
  const pool = createPostgresPool(config);
  const db = createDrizzleClient(pool);
  const repository = new DrizzleProjectRepository(db);

  return {
    pool,
    addProject: new AddProject(repository),
    getProject: new GetProject(repository),
    listProjects: new ListProjects(repository),
    async dispose() {
      await pool.end();
    },
  };
}
