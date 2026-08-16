import type { ProjectProfile } from "@guerrero-dev/domain";

/**
 * Orquesta la construcción y persistencia de `ProjectProfile` (Fase 5.7,
 * mapa §8a): `Git → detectores → ProjectProfile → Postgres (UPSERT)`.
 * Operación explícita que produce/reemplaza el perfil — nunca la invoca
 * `IProjectIntelligenceProvider` (solo lectura) ni ningún consumidor de
 * Agent Core. Quién decide *cuándo* llamar a `scanProject` (CLI explícito,
 * un futuro trigger) es una decisión fuera de esta subfase (mapa §6): no
 * hay política de staleness aquí, cada llamada re-escanea sin condiciones.
 *
 * `repoRoot` como parámetro, no `projectId` resuelto internamente contra
 * `IProjectRepository`: el scanner no decide qué proyecto escanear ni
 * conoce esa entidad, solo recibe los dos strings que necesita.
 */
export interface IProjectProfileScanner {
  /**
   * Devuelve el `ProjectProfile` autoritativo — exactamente lo que
   * devolvió `IProjectIntelligenceRepository.upsert()`, no el objeto
   * intermedio que este método construyó (su `id` puede diferir si ya
   * existía un perfil previo para `projectId`). Cualquier fallo durante el
   * escaneo (`IGitTrackedFilesSource`, `IPackageManifestReader`) aborta
   * por completo: no se produce ni persiste un perfil parcial.
   */
  scanProject(projectId: string, repoRoot: string): Promise<ProjectProfile>;
}
