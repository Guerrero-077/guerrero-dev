import type { MemoryRelation } from "@guerrero-dev/domain";

/** Puerto de persistencia de relaciones entre memorias — Fase 4.3 §10. */
export interface IMemoryRelationRepository {
  create(relation: MemoryRelation): Promise<MemoryRelation>;

  /** Relaciones donde `memoryId` es origen o destino. */
  findForMemory(memoryId: string): Promise<MemoryRelation[]>;
}
