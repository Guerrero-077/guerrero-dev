import type { MemoryScope } from "./MemoryScope.js";
import type { MemorySourceInput } from "./MemorySource.js";
import type { MemoryType } from "./MemoryType.js";

/**
 * Entrada al pipeline de evaluación (Fase 4.1 §8, §18): `Candidate !=
 * Memory`. No tiene `id`, `status` ni timestamps propios — todavía no está
 * decidido si se convertirá en una `Memory` persistida.
 *
 * ```text
 * Candidate → Deduplicate → Conflict detection → Confidence evaluation → Persist
 * ```
 *
 * La evaluación (`CandidateEvaluator`, Fase 4.7) decide si se acepta, si es
 * duplicado de una memoria existente, o si entra en conflicto con otra.
 */
export interface MemoryCandidate {
  readonly type: MemoryType;
  readonly scope: MemoryScope;
  readonly projectId: string | null;
  readonly content: string;
  readonly confidence: number;
  readonly importance: number;
  readonly source: MemorySourceInput;
}
