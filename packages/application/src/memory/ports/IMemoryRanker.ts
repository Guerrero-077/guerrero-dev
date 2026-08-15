import type { MemoryRankingContext } from "../models/MemoryRankingContext.js";
import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import type { MemorySearchResult } from "../models/MemorySearchResult.js";

/**
 * Scoring híbrido puro (Fase 4.6): sin SQL, sin I/O, solo aritmética sobre
 * los candidatos que ya trajo un `IMemoryCandidateRetriever`. Separado a
 * propósito de `IMemoryCandidateRetriever` — permite testear y ajustar la
 * fórmula de ranking (pesos, decay de recencia) sin PostgreSQL levantado,
 * y comparar semantic-only vs. hybrid ranking en el benchmark de retrieval
 * sin tocar la capa de infraestructura.
 */
export interface IMemoryRanker {
  rank(candidates: readonly MemorySearchCandidate[], context: MemoryRankingContext): MemorySearchResult[];
}
