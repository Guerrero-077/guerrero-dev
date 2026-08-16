import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { IEmbeddingProvider } from "../../common/ports/IEmbeddingProvider.js";
import type { MemoryDuplicateMatch } from "../models/MemoryDuplicateMatch.js";
import type { IMemoryCandidateDeduplicator } from "../ports/IMemoryCandidateDeduplicator.js";
import type { IMemoryCandidateRetriever } from "../ports/IMemoryCandidateRetriever.js";

/**
 * Más permisivo que el ejemplo ilustrativo de similarity=0.96 en
 * `docs/fase-4-memory-engine.md` §24-27 — ese número nunca fue una
 * decisión congelada, solo un ejemplo de prosa. `0.90` es el punto de
 * partida explícito para esta implementación, a ajustar con evidencia real
 * (falsos positivos/negativos medidos) igual que el resto de los umbrales
 * provisionales de Fase 4 (`DEFAULT_RECENCY_HALF_LIFE_DAYS`, los pesos de
 * `MemoryRanker`, etc.) — no una medición todavía.
 */
const DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD = 0.9;

/**
 * Tamaño del candidate pool que se le pide a `IMemoryCandidateRetriever`.
 * No hace falta un pool grande como en `MemoryRetriever` (Fase 4.6, que
 * necesita margen para un ranking híbrido) — acá solo importa si el más
 * parecido del mismo `type` supera el umbral, no reordenar nada.
 */
const DEFAULT_CANDIDATE_POOL_LIMIT = 10;

export interface MemoryCandidateDeduplicatorOptions {
  readonly similarityThreshold?: number;
  readonly candidatePoolLimit?: number;
}

/**
 * Implementación real de `IMemoryCandidateDeduplicator` (Fase 4.7, cierre
 * de la subfase pendiente en §14e): reusa el retrieval semántico de Fase
 * 4.6 (`IEmbeddingProvider` + `IMemoryCandidateRetriever`) en vez de una
 * segunda infraestructura de búsqueda paralela — Deduplicator y
 * `MemoryRetriever` comparten el mismo candidate pool semántico, solo lo
 * usan para preguntas distintas ("¿existe algo casi idéntico?" vs. "¿qué es
 * relevante para esta consulta?"). Por eso vive en `application/services`,
 * igual que `MemoryRetriever`, y no en `infrastructure`: no depende de
 * Drizzle ni de ninguna tecnología concreta, solo de los dos puertos.
 *
 * Filtra el pool a memorias del mismo `type` que el candidato — un `"fact"`
 * nunca puede ser duplicado de una `"decision"` aunque el texto sea
 * parecido, son afirmaciones de naturaleza distinta (Fase 4.1 §2). Del
 * subconjunto resultante toma la de mayor `semanticSimilarity` (el pool ya
 * llega ordenado por distancia ascendente desde `DrizzleMemoryCandidateRetriever`,
 * o sea, de mayor a menor similitud); si supera `similarityThreshold` se
 * reporta como duplicado.
 */
export class MemoryCandidateDeduplicator implements IMemoryCandidateDeduplicator {
  constructor(
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly candidateRetriever: IMemoryCandidateRetriever,
    private readonly options: MemoryCandidateDeduplicatorOptions = {},
  ) {}

  async findDuplicate(candidate: MemoryCandidate): Promise<MemoryDuplicateMatch | null> {
    const threshold = this.options.similarityThreshold ?? DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD;
    const limit = this.options.candidatePoolLimit ?? DEFAULT_CANDIDATE_POOL_LIMIT;

    const embedding = await this.embeddingProvider.embed(candidate.content);

    const pool = await this.candidateRetriever.findCandidates({
      embedding: embedding.values,
      limit,
      ...(candidate.projectId !== null ? { projectId: candidate.projectId } : {}),
    });

    const bestSameType = pool.find((result) => result.memory.type === candidate.type);
    if (!bestSameType || bestSameType.semanticSimilarity < threshold) {
      return null;
    }

    return { memoryId: bestSameType.memory.id, similarity: bestSameType.semanticSimilarity };
  }
}
