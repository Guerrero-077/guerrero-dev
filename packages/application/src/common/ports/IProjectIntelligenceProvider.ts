import type { ProjectProfile } from "@guerrero-dev/domain";

/**
 * Puerto de solo lectura hacia `ProjectProfile` (Fase 5.7, mapa §8).
 * Deliberadamente NO incluye `scanProject()`/`upsert()` ni ningún método
 * que dispare construcción del perfil — eso es responsabilidad de
 * `IProjectProfileScanner`. Agent Core (`ContextBuilder`, Fase 5.8) es
 * consumidor del perfil, no dueño del proceso de indexación: nunca debe
 * poder disparar un escaneo con I/O de filesystem/Git ni escritura en
 * PostgreSQL desde una operación de lectura.
 */
export interface IProjectIntelligenceProvider {
  getProjectProfile(projectId: string): Promise<ProjectProfile | null>;
}
