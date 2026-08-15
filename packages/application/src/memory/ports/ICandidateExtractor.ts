import type { CandidateExtractionResult } from "../models/CandidateExtractionResult.js";
import type { CommitSignal } from "../models/CommitSignal.js";

/**
 * Extracción semántica de candidatas a partir de un `CommitSignal` que ya
 * pasó `ICommitNoiseFilter` (Fase 4.8). Deliberadamente provider-agnostic
 * en el contrato — la primera implementación puede ser determinista
 * (reglas sobre `CommitSignal`), una implementación futura puede usar un
 * LLM local (Ollama) u otro provider, sin cambiar este puerto ni tocar
 * `MemoryCandidate`/Fase 4.7.
 *
 * Devuelve un array, no una única `CandidateExtractionResult`: un commit
 * puede producir cero, una, o varias candidatas (ver JSDoc de
 * `CandidateExtractionResult` — caso `666edb9` del golden dataset).
 */
export interface ICandidateExtractor {
  extract(signal: CommitSignal): Promise<readonly CandidateExtractionResult[]>;
}
