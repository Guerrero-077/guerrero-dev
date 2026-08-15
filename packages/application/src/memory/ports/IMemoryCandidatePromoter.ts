import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { MemoryEvaluation } from "../models/MemoryEvaluation.js";
import type { MemoryPromotionResult } from "../models/MemoryPromotionResult.js";

/**
 * Ejecuta la decisión de una `MemoryEvaluation` ya calculada (Fase 4.7):
 * crea/actualiza `Memory` + `MemorySource`, o crea una `MemoryRelation` de
 * conflicto. A diferencia de `IMemoryCandidateEvaluator`, sí usa
 * infraestructura — pero solo a través de puertos (`IMemoryRepository`,
 * `IMemorySourceRepository`, `IMemoryRelationRepository`), nunca SQL
 * directo en la implementación de `Application`.
 *
 * No implementa la política de decisión — eso ya viene resuelto en
 * `evaluation`. Este puerto solo traduce esa decisión a operaciones de
 * persistencia.
 */
export interface IMemoryCandidatePromoter {
  promote(candidate: MemoryCandidate, evaluation: MemoryEvaluation): Promise<MemoryPromotionResult>;
}
