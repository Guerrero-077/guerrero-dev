import type { MemoryCandidate, MemorySourceType } from "@guerrero-dev/domain";
import type { MemoryCandidateScore } from "../models/MemoryCandidateScore.js";
import type { IMemoryCandidateScorer } from "../ports/IMemoryCandidateScorer.js";

export interface MemoryCandidateScoreWeights {
  readonly confidence: number;
  readonly importance: number;
  readonly sourceType: number;
}

/**
 * Punto de partida provisional, igual criterio que `DEFAULT_PROJECT_RANKING_WEIGHTS`
 * en `MemoryRanker` (Fase 4.6): no es una medición, es lo que se valida
 * después con evidencia real. `confidence` pesa más que `importance` porque
 * el score decide si el candidato *merece existir* (calidad de la
 * afirmación), no cuánto importa una vez que ya existe.
 */
export const DEFAULT_CANDIDATE_SCORE_WEIGHTS: MemoryCandidateScoreWeights = {
  confidence: 0.5,
  importance: 0.3,
  sourceType: 0.2,
};

/**
 * Jerarquía de confiabilidad de `MemorySource.ts` (Fase 4.1 §6-7) traducida
 * a pesos `0..1`: código/tests/`manual` en el tope (verificable u
 * observado directamente, o cargado a mano por un humano fuera del flujo
 * automático), `conversation` en el medio (afirmación explícita del
 * usuario, sin verificar contra código), `agent_observation` al fondo
 * (inferencia del propio agente, la fuente menos confiable). Provisional,
 * a validar con benchmark real antes de considerarlo definitivo — mismo
 * criterio que el resto de los pesos de Fase 4.
 */
export const DEFAULT_SOURCE_TYPE_WEIGHTS: Record<MemorySourceType, number> = {
  repository: 1.0,
  file: 1.0,
  commit: 1.0,
  test: 1.0,
  manual: 1.0,
  conversation: 0.7,
  agent_observation: 0.4,
};

/**
 * Scoring determinista de un `MemoryCandidate` para la `Policy` de
 * promoción (Fase 4.7, cierre de la subfase pendiente en §14e):
 *
 * ```text
 * score = confidence * 0.5 + importance * 0.3 + sourceTypeWeight * 0.2
 * ```
 *
 * Deliberadamente NO usa `similarity` — esa señal es responsabilidad
 * exclusiva de `IMemoryCandidateDeduplicator` (frontera ya fijada en el
 * JSDoc de `IMemoryCandidateScorer`). Tampoco interpreta el contenido del
 * candidato: solo combina señales que ya vienen en el propio
 * `MemoryCandidate` (`confidence`, `importance`) más la jerarquía de
 * `source.sourceType`. Pesos y `sourceTypeWeights` inyectables por
 * constructor, con los defaults documentados acá — a reemplazar con
 * evidencia real (benchmark de promoción) antes de congelarlos.
 */
export class MemoryCandidateScorer implements IMemoryCandidateScorer {
  constructor(
    private readonly weights: MemoryCandidateScoreWeights = DEFAULT_CANDIDATE_SCORE_WEIGHTS,
    private readonly sourceTypeWeights: Record<MemorySourceType, number> = DEFAULT_SOURCE_TYPE_WEIGHTS,
  ) {}

  score(candidate: MemoryCandidate): MemoryCandidateScore {
    const sourceTypeWeight = this.sourceTypeWeights[candidate.source.sourceType];
    const score =
      candidate.confidence * this.weights.confidence +
      candidate.importance * this.weights.importance +
      sourceTypeWeight * this.weights.sourceType;

    return { score };
  }
}
