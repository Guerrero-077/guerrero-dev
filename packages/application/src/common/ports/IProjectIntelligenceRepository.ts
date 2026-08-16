import type { ProjectProfile } from "@guerrero-dev/domain";

/**
 * Persistencia de `ProjectProfile` (Fase 5.6). Una sola fila vigente por
 * proyecto, no histórico (dominio, Fase 5.1 §3) — `upsert` reemplaza el
 * perfil entero en cada llamada, nunca hace `UPDATE` incremental campo por
 * campo.
 *
 * `id` se conserva entre llamadas a `upsert` para el mismo `projectId`: un
 * re-scan no crea otra identidad de `ProjectProfile`, actualiza el
 * snapshot vigente del mismo perfil — por eso `upsert` devuelve la fila
 * real (`id` puede diferir del que traía el `ProjectProfile` recibido, si
 * ya existía una fila previa para ese proyecto).
 *
 * Superficie mínima — sin `delete` (`ON DELETE CASCADE` desde `projects`
 * ya cubre la limpieza) ni `findAll` (sin consumidor real todavía), mismo
 * criterio que el resto de puertos de esta fase.
 */
export interface IProjectIntelligenceRepository {
  upsert(profile: ProjectProfile): Promise<ProjectProfile>;
  findByProjectId(projectId: string): Promise<ProjectProfile | null>;
}
