/**
 * Resultado de evaluar un `MemoryCandidate` (Fase 4.7, diseño original en
 * docs/fase-4-memory-engine.md §24-27). Contrato central del pipeline de
 * candidatos: separa la *evaluación* (pura, sin I/O más allá de las
 * consultas de lectura que hagan `IMemoryCandidateDeduplicator`/
 * `IMemoryConflictDetector`) de la *promoción* (que sí escribe en
 * PostgreSQL vía `IMemoryCandidatePromoter`).
 *
 * Deliberadamente NO tiene un campo `status`/`action` propio — el outcome
 * (`rejected` | `duplicate` | `conflict` | `accepted`) se deriva de los
 * campos existentes para evitar estados que puedan contradecirse entre sí:
 *
 * ```text
 * accepted === false        -> rejected
 * duplicateOf !== null      -> duplicate
 * conflictsWith.length > 0  -> conflict
 * accepted === true
 *   && duplicateOf === null
 *   && conflictsWith = []   -> accepted
 * ```
 *
 * Ver `evaluationOutcome()` para la función que deriva ese outcome.
 */
export interface MemoryEvaluation {
  readonly accepted: boolean;
  readonly confidence: number;
  readonly importance: number;
  readonly duplicateOf: string | null;
  readonly conflictsWith: readonly string[];
  readonly reason: string;
}

/**
 * Los cuatro resultados posibles de evaluar un candidato, derivados de
 * `MemoryEvaluation` (nunca almacenados como campo aparte — ver JSDoc de
 * `MemoryEvaluation`).
 */
export type MemoryEvaluationOutcome = "rejected" | "duplicate" | "conflict" | "accepted";

/**
 * Proyección de reporting/clasificación de una `MemoryEvaluation` a una
 * sola etiqueta — para logs, métricas, UI. **No representa el resultado
 * operativo y no debe usarse para decidir qué operaciones de persistencia
 * ejecutar.** `duplicateOf` y `conflictsWith` no son mutuamente excluyentes
 * (Fase 4.7): un candidato puede a la vez actualizar una memoria duplicada
 * Y crear una relación de conflicto contra otra. `IMemoryCandidatePromoter`
 * debe leer `evaluation.duplicateOf`/`evaluation.conflictsWith`/
 * `evaluation.accepted` directamente y ejecutar cada operación que
 * corresponda — nunca hacer `switch` sobre este outcome.
 *
 * Orden de precedencia para la etiqueta única: `rejected` > `conflict` >
 * `duplicate` > `accepted`. Un conflicto se reporta antes que un duplicado
 * porque requiere atención — un duplicado normalmente significa "el
 * sistema ya conocía esto", mientras que un conflicto es una contradicción
 * real que alguien debería revisar.
 */
export function evaluationOutcome(evaluation: MemoryEvaluation): MemoryEvaluationOutcome {
  if (!evaluation.accepted) return "rejected";
  if (evaluation.conflictsWith.length > 0) return "conflict";
  if (evaluation.duplicateOf !== null) return "duplicate";
  return "accepted";
}
