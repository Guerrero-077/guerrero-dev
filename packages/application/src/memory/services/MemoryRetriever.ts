import type { IEmbeddingProvider } from "../../common/ports/IEmbeddingProvider.js";
import { DEFAULT_RECENCY_HALF_LIFE_DAYS } from "../models/MemoryRankingContext.js";
import type { MemoryRankingWeights } from "../models/MemoryRankingWeights.js";
import {
  DEFAULT_GLOBAL_RANKING_WEIGHTS,
  DEFAULT_PROJECT_RANKING_WEIGHTS,
} from "../models/MemoryRankingWeights.js";
import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import type { MemorySearchQuery } from "../models/MemorySearchQuery.js";
import type { MemorySearchResult } from "../models/MemorySearchResult.js";
import type { IMemoryCandidateRetriever } from "../ports/IMemoryCandidateRetriever.js";
import type { IMemoryRanker } from "../ports/IMemoryRanker.js";
import type { IMemoryRetriever } from "../ports/IMemoryRetriever.js";

const DEFAULT_TOP_K = 10;

/**
 * `candidateK > topK` (Fase 4.6): si solo se traen tantos candidatos como
 * resultados finales se piden, un candidato #6 con mucha más
 * confianza/importancia que los primeros 5 semánticos nunca puede ganar el
 * ranking híbrido. `max(topK*10, 50)` es un punto de partida razonable, no
 * una regla congelada — el benchmark de retrieval (Recall@K con distintos
 * tamaños de candidate pool) decide si conviene otro valor.
 */
function defaultCandidateLimit(topK: number): number {
  return Math.max(topK * 10, 50);
}

export interface MemoryRetrieverOptions {
  /** Pesos cuando `query.projectId` está presente. Default: `DEFAULT_PROJECT_RANKING_WEIGHTS`. */
  readonly projectWeights?: MemoryRankingWeights;
  /** Pesos cuando `query.projectId` está ausente (búsqueda global). Default: `DEFAULT_GLOBAL_RANKING_WEIGHTS`. */
  readonly globalWeights?: MemoryRankingWeights;
  readonly recencyHalfLifeDays?: number;
  /** Cuántos candidatos pedir al `IMemoryCandidateRetriever` para un `topK` dado. Default: `defaultCandidateLimit`. */
  readonly candidateLimit?: (topK: number) => number;
}

/**
 * El caso de uso real de retrieval (Fase 4.1 §21, Fase 4.6): orquesta
 * `IEmbeddingProvider` + `IMemoryCandidateRetriever` + `IMemoryRanker` sin
 * conocer los detalles de ninguno. Nada de SQL, nada de Ollama acá — eso
 * vive exclusivamente en las implementaciones concretas de esos puertos.
 */
export class MemoryRetriever implements IMemoryRetriever {
  constructor(
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly candidateRetriever: IMemoryCandidateRetriever,
    private readonly ranker: IMemoryRanker,
    private readonly options: MemoryRetrieverOptions = {},
  ) {}

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    const topK = query.limit ?? DEFAULT_TOP_K;
    const candidateLimit = (this.options.candidateLimit ?? defaultCandidateLimit)(topK);

    const queryEmbedding = await this.embeddingProvider.embed(query.text);

    const candidates = await this.candidateRetriever.findCandidates({
      embedding: queryEmbedding.values,
      limit: candidateLimit,
      ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
    });

    const filtered = this.filterByTypeAndScope(candidates, query);

    const weights =
      query.projectId !== undefined
        ? (this.options.projectWeights ?? DEFAULT_PROJECT_RANKING_WEIGHTS)
        : (this.options.globalWeights ?? DEFAULT_GLOBAL_RANKING_WEIGHTS);

    const ranked = this.ranker.rank(filtered, {
      weights,
      recencyHalfLifeDays: this.options.recencyHalfLifeDays ?? DEFAULT_RECENCY_HALF_LIFE_DAYS,
      ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
    });

    return ranked.slice(0, topK);
  }

  /**
   * Post-filtro por `types`/`scopes` sobre el candidate pool (Fase 4.6):
   * `IMemoryCandidateRetriever`/`MemorySemanticQuery` no filtran por eso a
   * propósito (ver JSDoc de `DrizzleMemoryCandidateRetriever`) — se aplica
   * acá, antes del ranking, para no gastar presupuesto de `topK` en
   * candidatos que de todos modos se iban a descartar. Si en la práctica
   * esto deja muy pocos candidatos después de filtrar, es una señal para
   * subir `candidateLimit`, medible en el benchmark de retrieval.
   */
  private filterByTypeAndScope(
    candidates: readonly MemorySearchCandidate[],
    query: MemorySearchQuery,
  ): readonly MemorySearchCandidate[] {
    if (!query.types && !query.scopes) return candidates;

    return candidates.filter((candidate) => {
      const matchesType = !query.types || query.types.includes(candidate.memory.type);
      const matchesScope = !query.scopes || query.scopes.includes(candidate.memory.scope);
      return matchesType && matchesScope;
    });
  }
}
