import type { MemoryCandidate } from "@guerrero-dev/domain";

/**
 * Validación estructural de un `MemoryCandidate` (Fase 4.7): ¿es
 * válido en sí mismo? (`confidence`/`importance` en rango, `scope`
 * consistente con `projectId`, etc. — reutilizando los invariantes de
 * dominio en `MemoryInvariants`).
 *
 * Deliberadamente NO decide `duplicate`/`conflict`/`accepted` — eso es
 * responsabilidad de `IMemoryCandidateDeduplicator`/`IMemoryConflictDetector`
 * y de la política en `IMemoryCandidateEvaluator`. Este puerto solo
 * responde "¿el candidato está bien formado?", lanzando si no lo está.
 */
export interface IMemoryCandidateValidator {
  validate(candidate: MemoryCandidate): void;
}
