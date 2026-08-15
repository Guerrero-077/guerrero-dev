import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { MemoryEvaluation } from "../models/MemoryEvaluation.js";
import type { IMemoryCandidateDeduplicator } from "../ports/IMemoryCandidateDeduplicator.js";
import type { IMemoryCandidateEvaluator } from "../ports/IMemoryCandidateEvaluator.js";
import type { IMemoryCandidateScorer } from "../ports/IMemoryCandidateScorer.js";
import type { IMemoryCandidateValidator } from "../ports/IMemoryCandidateValidator.js";
import type { IMemoryConflictDetector } from "../ports/IMemoryConflictDetector.js";

/**
 * Umbral de aceptación por defecto para la `Policy` (score compuesto de
 * `IMemoryCandidateScorer`). Provisional, igual que los umbrales de
 * `reasons` en `MemoryRanker` — un candidato con score exactamente en el
 * umbral se acepta (`>=`, no `>`).
 */
const DEFAULT_ACCEPTANCE_THRESHOLD = 0.5;

export interface MemoryCandidateEvaluatorOptions {
  readonly acceptanceThreshold?: number;
}

/**
 * Orquestador puro del pipeline de evaluación (Fase 4.7):
 * `Validator -> Deduplicator -> ConflictDetector -> Scorer -> Policy ->
 * MemoryEvaluation`. No toca PostgreSQL — delega toda lectura a los puertos
 * recibidos por constructor, lo que permite testear el pipeline completo
 * con fakes, sin infraestructura real.
 *
 * Decisión clave: `Deduplicator` y `ConflictDetector` se consultan siempre
 * (no hay short-circuit), no solo cuando el candidato "pasa" la etapa
 * anterior. Esto es deliberado — un candidato puede ser simultáneamente
 * duplicado de una memoria Y entrar en conflicto con otra (ver
 * `evaluationOutcome` en `MemoryEvaluation.ts`: la precedencia entre
 * `duplicate` y `conflict` se resuelve al *leer* la evaluación, no al
 * *calcularla*). Calcular ambos siempre también preserva evidencia
 * completa en `MemoryEvaluation` incluso cuando el candidato termina
 * rechazado.
 *
 * `accepted` es una decisión de `Policy` basada únicamente en el score de
 * `IMemoryCandidateScorer` contra `acceptanceThreshold` — es independiente
 * de si el candidato es duplicado o entra en conflicto. Ver el JSDoc de
 * `MemoryPromotionResult` para cómo `IMemoryCandidatePromoter` traduce
 * `accepted + duplicateOf/conflictsWith` en una acción real.
 */
export class MemoryCandidateEvaluator implements IMemoryCandidateEvaluator {
  constructor(
    private readonly validator: IMemoryCandidateValidator,
    private readonly deduplicator: IMemoryCandidateDeduplicator,
    private readonly conflictDetector: IMemoryConflictDetector,
    private readonly scorer: IMemoryCandidateScorer,
    private readonly options: MemoryCandidateEvaluatorOptions = {},
  ) {}

  async evaluate(candidate: MemoryCandidate): Promise<MemoryEvaluation> {
    try {
      this.validator.validate(candidate);
    } catch (error) {
      return this.rejected(candidate, `Candidato inválido: ${errorMessage(error)}`);
    }

    const [duplicate, conflicts] = await Promise.all([
      this.deduplicator.findDuplicate(candidate),
      this.conflictDetector.findConflicts(candidate),
    ]);

    const { score } = this.scorer.score(candidate);
    const threshold = this.options.acceptanceThreshold ?? DEFAULT_ACCEPTANCE_THRESHOLD;
    const accepted = score >= threshold;

    return {
      accepted,
      confidence: candidate.confidence,
      importance: candidate.importance,
      duplicateOf: duplicate?.memoryId ?? null,
      conflictsWith: conflicts,
      reason: this.reason(accepted, score, threshold, duplicate, conflicts),
    };
  }

  private rejected(candidate: MemoryCandidate, reason: string): MemoryEvaluation {
    return {
      accepted: false,
      confidence: candidate.confidence,
      importance: candidate.importance,
      duplicateOf: null,
      conflictsWith: [],
      reason,
    };
  }

  private reason(
    accepted: boolean,
    score: number,
    threshold: number,
    duplicate: { memoryId: string; similarity: number } | null,
    conflicts: readonly string[],
  ): string {
    if (!accepted) return `Score ${score.toFixed(2)} por debajo del umbral ${threshold.toFixed(2)}`;
    if (duplicate) return `Duplicado de memoria existente (similarity=${duplicate.similarity.toFixed(2)})`;
    if (conflicts.length > 0) return `Conflicto con ${conflicts.length} memoria(s) existente(s)`;
    return `Score ${score.toFixed(2)} por encima del umbral ${threshold.toFixed(2)}`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
