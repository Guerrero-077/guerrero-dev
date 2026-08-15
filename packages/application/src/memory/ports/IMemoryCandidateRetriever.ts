import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import type { MemorySemanticQuery } from "../models/MemorySemanticQuery.js";

/**
 * Retrieval semántico puro (Fase 4.6): SQL + pgvector + filtros +
 * candidate limit. Nada de ranking híbrido acá — eso es `IMemoryRanker`.
 *
 * Frontera deliberada con `IMemoryEmbeddingRepository` (Fase 4.5):
 * `IMemoryEmbeddingRepository` es persistencia (CRUD de un embedding),
 * `IMemoryCandidateRetriever` es la capacidad de infraestructura de
 * "encontrar memorias semánticamente parecidas a un vector". Mezclar
 * ambas en el repository de persistencia habría hecho que un contrato de
 * CRUD empezara a expresar capacidades de búsqueda.
 *
 * La implementación concreta (`DrizzleMemoryCandidateRetriever`, pendiente)
 * debe traer *más* candidatos de los que el usuario pidió como resultado
 * final (candidateK > topK): el ranking híbrido necesita margen para
 * reordenar — si solo se traen los 5 más similares semánticamente, un
 * candidato #6 con muchísima más confianza/importancia nunca puede ganar.
 */
export interface IMemoryCandidateRetriever {
  findCandidates(query: MemorySemanticQuery): Promise<MemorySearchCandidate[]>;
}
