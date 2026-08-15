import type { CommitSignal } from "../models/CommitSignal.js";

/**
 * Resultado de `ICommitNoiseFilter.shouldDiscard` — incluye `reason` por
 * la misma razón que el resto de este diseño la incluye en cada etapa
 * (`CandidateExtractionResult`, `MemoryEvaluation` en Fase 4.7): un
 * `boolean` solo no deja rastro de auditoría de por qué se descartó un
 * commit, y el golden dataset (`docs/benchmarks/candidate-detection/`)
 * siempre registra el motivo, no solo la etiqueta.
 */
export interface CommitNoiseFilterResult {
  readonly discard: boolean;
  readonly reason: string;
}

/**
 * Filtro determinista sobre un `CommitSignal` (Fase 4.8) — descarta ruido
 * obvio (archivos generados, docs triviales, patrones ya conocidos) antes
 * de gastar interpretación semántica/LLM en `ICandidateExtractor`. Recibe
 * `CommitSignal`, no `MemoryCandidate` — corre antes de que exista
 * ninguna candidata.
 *
 * Debe ser puro y síncrono: sin I/O, sin llamadas a red, barato de correr
 * sobre los 23 casos del golden dataset como primer benchmark real de
 * Fase 4.8 (ver `docs/benchmarks/candidate-detection/README.md`).
 */
export interface ICommitNoiseFilter {
  shouldDiscard(signal: CommitSignal): CommitNoiseFilterResult;
}
