import type { ProjectProfile } from "@guerrero-dev/domain";
import type { IProjectIntelligenceProvider } from "../../common/ports/IProjectIntelligenceProvider.js";
import type { IProjectIntelligenceRepository } from "../../common/ports/IProjectIntelligenceRepository.js";

/**
 * `IProjectIntelligenceProvider` (Fase 5.7): estrecha deliberadamente la
 * superficie de `IProjectIntelligenceRepository` a solo lectura — delega
 * en `findByProjectId`, sin tocar Postgres/Drizzle directamente (no hace
 * falta vivir en `infrastructure/`, no hay I/O propio). `ContextBuilder`
 * (Fase 5.8) recibirá esta interfaz, nunca el repositorio completo: es
 * consumidor del perfil, no dueño del proceso de indexación (mapa §8).
 */
export class ProjectIntelligenceProvider implements IProjectIntelligenceProvider {
  constructor(private readonly repository: IProjectIntelligenceRepository) {}

  getProjectProfile(projectId: string): Promise<ProjectProfile | null> {
    return this.repository.findByProjectId(projectId);
  }
}
