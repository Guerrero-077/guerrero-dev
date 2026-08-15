import type { Memory } from "@guerrero-dev/domain";
import type { MemoryRankingContext } from "../models/MemoryRankingContext.js";
import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import type { MemorySearchResult } from "../models/MemorySearchResult.js";
import type { IMemoryRanker } from "../ports/IMemoryRanker.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Umbrales para `reasons` (explicativos — no participan en el score).
// Provisionales: el benchmark de retrieval de Fase 4.6 puede ajustarlos
// junto con los pesos, no son un contrato congelado.
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const HIGH_IMPORTANCE_THRESHOLD = 0.8;
const HIGH_SEMANTIC_SIMILARITY_THRESHOLD = 0.7;
const RECENT_THRESHOLD = 0.8;

/**
 * Scoring híbrido puro (Fase 4.6): sin SQL, sin I/O — solo aritmética sobre
 * candidatos que ya trajo un `IMemoryCandidateRetriever`. Eso es lo que
 * permite testear/ajustar la fórmula sin PostgreSQL levantado.
 */
export class MemoryRanker implements IMemoryRanker {
  rank(candidates: readonly MemorySearchCandidate[], context: MemoryRankingContext): MemorySearchResult[] {
    const now = context.now ?? new Date();
    const weights = context.weights;

    return candidates
      .map((candidate): MemorySearchResult => {
        const { memory, semanticSimilarity } = candidate;

        const projectRelevance = this.projectRelevance(memory, context.projectId);
        const confidence = memory.confidence;
        const importance = memory.importance;
        const recency = this.recency(
          memory.lastVerifiedAt ?? memory.updatedAt,
          now,
          context.recencyHalfLifeDays,
        );

        const score =
          semanticSimilarity * weights.semanticSimilarity +
          projectRelevance * weights.projectRelevance +
          confidence * weights.confidence +
          importance * weights.importance +
          recency * weights.recency;

        const reasons: string[] = [];
        if (semanticSimilarity >= HIGH_SEMANTIC_SIMILARITY_THRESHOLD) reasons.push("semantic_similarity");
        if (context.projectId !== undefined && memory.projectId === context.projectId) {
          reasons.push("same_project");
        }
        if (confidence >= HIGH_CONFIDENCE_THRESHOLD) reasons.push("high_confidence");
        if (importance >= HIGH_IMPORTANCE_THRESHOLD) reasons.push("high_importance");
        if (recency >= RECENT_THRESHOLD) reasons.push("recent");

        return { memory, score, reasons };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 1 si la memoria es del mismo proyecto que `contextProjectId`, o si es
   * conocimiento `global` (aplica igual en cualquier proyecto). 0 si es de
   * un proyecto distinto y específico — ejemplo del diseño original (Fase
   * 4.1 §22): "JWT + Refresh Tokens" de GESCOMPH no debe rankear alto
   * cuando se pregunta por autenticación en Miller, que usa OAuth+Sessions.
   *
   * Sin `contextProjectId` (búsqueda sin proyecto de referencia) el factor
   * es neutro (1) para todos — no hay base para penalizar a nadie.
   */
  private projectRelevance(memory: Memory, contextProjectId: string | undefined): number {
    if (contextProjectId === undefined) return 1;
    if (memory.scope === "global") return 1;
    return memory.projectId === contextProjectId ? 1 : 0;
  }

  /**
   * Decay exponencial real de media vida (no `1 / age`, que penalizaría de
   * forma desproporcionada memorias viejas pero todavía válidas): a
   * `ageDays === halfLifeDays`, `recency === 0.5` exactamente, de ahí el
   * factor `Math.LN2`. `referenceDate` es `lastVerifiedAt` si existe (una
   * memoria reverificada recientemente es "fresca" aunque sea vieja),
   * `updatedAt` si no.
   */
  private recency(referenceDate: Date, now: Date, halfLifeDays: number): number {
    const ageDays = Math.max(0, (now.getTime() - referenceDate.getTime()) / MS_PER_DAY);
    return Math.exp((-ageDays * Math.LN2) / halfLifeDays);
  }
}
