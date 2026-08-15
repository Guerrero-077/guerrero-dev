import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { MemoryEvaluation } from "../models/MemoryEvaluation.js";

/**
 * Orquestador puro del pipeline de evaluación (Fase 4.7):
 * `Validator -> Deduplicator -> ConflictDetector -> Scorer -> Policy ->
 * MemoryEvaluation`. No toca PostgreSQL directamente — delega toda lectura
 * a los puertos que recibe por constructor (`MemoryCandidateEvaluator`).
 *
 * Separado a propósito de `IMemoryCandidatePromoter`: evaluar un candidato
 * (decidir qué debería pasar) y promoverlo (ejecutar esa decisión contra
 * `IMemoryRepository`/`IMemorySourceRepository`/`IMemoryRelationRepository`)
 * son responsabilidades distintas — la primera es mucho más fácil de
 * testear sin infraestructura real.
 */
export interface IMemoryCandidateEvaluator {
  evaluate(candidate: MemoryCandidate): Promise<MemoryEvaluation>;
}
