import type { CandidateExtractionResult } from "../models/CandidateExtractionResult.js";
import type { CommitSnapshot } from "../models/CommitSnapshot.js";
import type { ICandidateExtractor } from "../ports/ICandidateExtractor.js";
import type { ICommitAnalyzer } from "../ports/ICommitAnalyzer.js";
import type { ICommitNoiseFilter } from "../ports/ICommitNoiseFilter.js";

/**
 * Orquestador de Fase 4.8 — `CommitSnapshot -> ICommitAnalyzer ->
 * CommitSignal -> ICommitNoiseFilter -> ICandidateExtractor ->
 * CandidateExtractionResult[]`.
 *
 * Deliberadamente NO analiza, filtra ni extrae — cada decisión real vive
 * en el puerto correspondiente. Esta clase solo coordina el orden y
 * corta el pipeline temprano si `ICommitNoiseFilter` descarta el commit,
 * para no gastar `ICandidateExtractor` (potencialmente un LLM) en ruido
 * ya identificado.
 *
 * No toca `IMemoryCandidateEvaluator`/`IMemoryCandidatePromoter` (Fase
 * 4.7) — quien orquesta ese siguiente paso (incluyendo qué hacer con
 * `outcome === "pending_review"`) es responsabilidad de quien use este
 * servicio, no de `CandidateDetectionService` en sí.
 */
export class CandidateDetectionService {
  constructor(
    private readonly analyzer: ICommitAnalyzer,
    private readonly noiseFilter: ICommitNoiseFilter,
    private readonly extractor: ICandidateExtractor,
  ) {}

  async detect(commit: CommitSnapshot): Promise<readonly CandidateExtractionResult[]> {
    const signal = await this.analyzer.analyze(commit);

    const filterResult = this.noiseFilter.shouldDiscard(signal);
    if (filterResult.discard) {
      return [{ outcome: "rejected", candidate: null, riskSignals: [], reason: filterResult.reason }];
    }

    return this.extractor.extract(signal);
  }
}
