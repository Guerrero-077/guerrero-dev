import type { ProjectComponent } from "@guerrero-dev/domain";

/**
 * Deriva `structure`/`components` de `ProjectProfile` (Fase 5.5) a partir
 * exclusivamente de `trackedFiles` (5.2, `IGitTrackedFilesSource`) — puro
 * y síncrono, sin I/O, mismo criterio que `ITechnologyDetector` (5.4). No
 * lee `package.json`, no interpreta `pnpm-workspace.yaml`, no lista
 * directorios: toda la evidencia ya está en la lista plana de archivos
 * tracked.
 *
 * Un puerto, dos métodos: comparten fuente de evidencia (`trackedFiles`) y
 * la misma responsabilidad arquitectónica (derivar organización del
 * proyecto), aunque produzcan campos distintos de `ProjectProfile`.
 */
export interface IComponentStructureDetector {
  /**
   * Prefijos de profundidad 1 y 2 derivados de `trackedFiles`, sin
   * filtrar por tipo de carpeta. Deduplicado y ordenado
   * lexicográficamente — el resultado no depende del orden de entrada.
   */
  detectStructure(trackedFiles: readonly string[]): readonly string[];

  /**
   * Carpetas de profundidad 2 bajo `apps/` o `packages/` que tienen su
   * propio `package.json` entre `trackedFiles`. No interpreta
   * `pnpm-workspace.yaml`: un componente con `package.json` tracked pero
   * excluido del workspace real igual se detecta — limitación conocida y
   * aceptada de v1, no un error. Ordenado por `path`.
   */
  detectComponents(trackedFiles: readonly string[]): readonly ProjectComponent[];
}
