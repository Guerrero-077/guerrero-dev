/**
 * Resultado de `IMemoryCandidateScorer.score` (Fase 4.7). No duplica
 * `confidence`/`importance` — esos campos ya viven en `MemoryCandidate`
 * (dominio). Este tipo es deliberadamente mínimo: un score compuesto para
 * la política de promoción (`Policy`, dentro de `MemoryCandidateEvaluator`).
 */
export interface MemoryCandidateScore {
  readonly score: number;
}
