import { dirname } from "node:path";
import type { Project } from "@guerrero-dev/domain";
import type { IProjectRepository } from "../common/ports/IProjectRepository.js";

/**
 * Caso de uso: resolver el proyecto registrado más cercano recorriendo
 * `startPath` hacia arriba (mismo patrón que Git busca `.git`) hasta
 * encontrar un match exacto contra `Project.path`, o hasta agotar la raíz
 * del filesystem (Fase 0 del plan de "agente real" — reemplaza el
 * `projectId` UUID manual que exigía `agent run`). El repositorio solo
 * hace match exacto (`findByPath`, mismo patrón simple que `findById`) —
 * el recorrido de ancestros vive acá, no en infraestructura.
 *
 * Limitación conocida, sin resolver acá: no normaliza symlinks ni
 * trailing slashes — coherente con que `AddProject` tampoco normaliza
 * `path` más allá de `trim()`. Si un proyecto se registró con una ruta
 * distinta a la que el filesystem resuelve para el mismo directorio
 * (symlink, mayúsculas en Windows), el match exacto falla.
 */
export class ResolveProjectFromCwd {
  constructor(private readonly repository: IProjectRepository) {}

  async execute(startPath: string): Promise<Project | null> {
    let current = startPath;
    for (;;) {
      const project = await this.repository.findByPath(current);
      if (project) return project;

      const parent = dirname(current);
      if (parent === current) return null; // llegó a la raíz del filesystem, sin match
      current = parent;
    }
  }
}
