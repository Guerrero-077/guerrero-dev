import type { Memory } from "@guerrero-dev/domain";

/**
 * Puerto de persistencia de `Memory` (Fase 4.3 §10). Deliberadamente
 * separado de `IMemorySourceRepository`/`IMemoryRelationRepository` — un
 * único `IMemoryRepository` gigante que también maneje fuentes y
 * relaciones terminaría siendo una "god interface".
 *
 * Nota respecto al diseño original (Fase 4.1/4.3): los ids se tipan como
 * `string`, no `MemoryId`/`ProjectId`, para mantener consistencia con
 * `IProjectRepository` (que ya usa `string`) y con `Memory.id`/`projectId`
 * en el dominio. Introducir branded types ahora sería un cambio más
 * amplio, no pedido, y no aplicado todavía en ningún otro lado del
 * monorepo.
 */
export interface IMemoryRepository {
  create(memory: Memory): Promise<Memory>;

  findById(id: string): Promise<Memory | null>;

  update(memory: Memory): Promise<Memory>;

  findByProject(projectId: string): Promise<Memory[]>;

  /**
   * `reason` todavía no se persiste en ningún lado — no existe
   * `memory_events` (excluido deliberadamente hasta validar el
   * comportamiento real, Fase 4.1 §9). La implementación solo cambia
   * `status` a `"invalidated"`. Cuando se agregue `memory_events`, este
   * método debe escribir `reason` ahí.
   */
  invalidate(id: string, reason: string): Promise<void>;
}
