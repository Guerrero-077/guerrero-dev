import type { Project } from "@guerrero-dev/domain";

/**
 * Contrato de persistencia de proyectos. `DrizzleProjectRepository`
 * (`infrastructure/database/repositories`) es la implementación real.
 * La entidad `Project` ya viene completa (id/timestamps incluidos) —
 * quien la construye es el caso de uso (`AddProject`), no el repositorio.
 */
export interface IProjectRepository {
  create(project: Project): Promise<Project>;

  findById(id: string): Promise<Project | null>;

  /**
   * Match exacto contra `Project.path` (columna `UNIQUE`, migración 0001).
   * Usado por `ResolveProjectFromCwd` para recorrer ancestros de un
   * directorio — el recorrido vive en el caso de uso, este método solo
   * resuelve un path exacto, mismo criterio simple que `findById`.
   */
  findByPath(path: string): Promise<Project | null>;

  findAll(): Promise<Project[]>;
}
