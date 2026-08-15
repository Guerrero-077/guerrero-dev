import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { MemoryCandidateScore } from "../models/MemoryCandidateScore.js";

/**
 * Scoring de un `MemoryCandidate` para la política de promoción (Fase
 * 4.7). Deliberadamente distinto de `IMemoryRanker` (Fase 4.6): rankear
 * memorias ya existentes para retrieval y decidir si un candidato nuevo
 * merece persistirse son problemas diferentes, no se reutiliza el mismo
 * componente para ambos.
 */
export interface IMemoryCandidateScorer {
  score(candidate: MemoryCandidate): MemoryCandidateScore;
}
