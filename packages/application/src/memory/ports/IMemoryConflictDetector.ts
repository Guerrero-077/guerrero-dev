import type { MemoryCandidate } from "@guerrero-dev/domain";

/**
 * Detección de conflictos de un `MemoryCandidate` contra memorias
 * existentes (Fase 4.7): devuelve los `id` de las memorias con las que el
 * candidato contradice (futura `MemoryRelation` de tipo `contradicts`,
 * Fase 4.2, creada en `IMemoryCandidatePromoter`, no acá).
 *
 * Separado de `IMemoryCandidateDeduplicator` — ver JSDoc de ese puerto.
 */
export interface IMemoryConflictDetector {
  findConflicts(candidate: MemoryCandidate): Promise<readonly string[]>;
}
