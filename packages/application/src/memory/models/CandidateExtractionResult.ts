import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { RiskSignal } from "./RiskSignal.js";

/**
 * Qué debe hacer el pipeline con un `CandidateExtractionResult` (Fase
 * 4.8) — deliberadamente NO es un campo `requiresReview` colgado de
 * `MemoryCandidate`: el dominio (Fase 4.1) se mantiene simple a propósito,
 * y "pendiente de revisión humana" es una preocupación operacional de
 * 4.8, no del modelo de dominio.
 *
 * - `rejected`: descartado (ruido, o extracción sin señal suficiente).
 * - `pending_review`: hay un `RiskSignal` que exige revisión humana antes
 *   de seguir — la candidata NO se envía todavía al Evaluator de Fase 4.7.
 * - `ready`: puede pasar al pipeline de Fase 4.7
 *   (`IMemoryCandidateEvaluator` → `IMemoryCandidatePromoter`) tal cual.
 *
 * Una aprobación humana sobre `pending_review` no salta 4.7 — el
 * candidato aprobado igual pasa por Validation → Deduplication →
 * Conflict detection → Scoring → Promotion como cualquier otro.
 */
export type CandidateExtractionOutcome = "rejected" | "pending_review" | "ready";

/**
 * Resultado de intentar extraer UNA candidata de un `CommitSignal` (Fase
 * 4.8). Un commit puede producir cero, una, o varias candidatas — ver
 * `docs/benchmarks/candidate-detection/guerrero-dev/666edb9.json`, un
 * commit de diseño de 420 líneas con múltiples decisiones documentadas en
 * un solo commit. Por eso este tipo describe UN resultado, y
 * `ICandidateExtractor.extract()` devuelve `readonly
 * CandidateExtractionResult[]` — la cardinalidad vive en la interfaz, no
 * en este tipo.
 *
 * Invariantes:
 * - `outcome === "rejected"` implica `candidate === null`.
 * - `outcome === "pending_review"` implica `candidate !== null`.
 * - `outcome === "ready"` implica `candidate !== null`.
 *
 * No se codifican estos invariantes en el sistema de tipos (requeriría
 * una unión discriminada más compleja) — se validan en tests, mismo
 * criterio que otros invariantes de este dominio (`MemoryInvariants.ts`).
 */
export interface CandidateExtractionResult {
  readonly outcome: CandidateExtractionOutcome;
  readonly candidate: MemoryCandidate | null;
  readonly riskSignals: readonly RiskSignal[];
  readonly reason: string;
}
