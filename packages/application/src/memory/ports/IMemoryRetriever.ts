import type { MemorySearchQuery } from "../models/MemorySearchQuery.js";
import type { MemorySearchResult } from "../models/MemorySearchResult.js";

/**
 * El caso de uso real de retrieval (Fase 4.1 §21, Fase 4.6). La
 * implementación orquesta tres dependencias sin conocer los detalles de
 * ninguna:
 *
 * - `IEmbeddingProvider` (Fase 4.4): `query.text` -> vector.
 * - `IMemoryCandidateRetriever` (Fase 4.6): vector + filtros -> candidatos
 *   semánticos (más de los que se van a devolver — ver ese puerto).
 * - `IMemoryRanker` (Fase 4.6): candidatos -> resultados ordenados.
 *
 * Nada de SQL ni de detalles de Ollama en la implementación de este
 * puerto — eso vive exclusivamente en las dependencias de arriba.
 */
export interface IMemoryRetriever {
  search(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
}
