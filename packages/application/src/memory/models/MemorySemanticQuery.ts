/**
 * Entrada de `IMemoryCandidateRetriever` (Fase 4.6): deliberadamente más
 * angosta que `MemorySearchQuery` — el candidate retriever no sabe qué es
 * "texto de búsqueda", solo sabe embeddings + filtros estructurados +
 * cuántos candidatos traer. Pasar el `MemorySearchQuery` completo (que
 * incluye `text`, `types`, `scopes`) obligaría a la infraestructura a
 * conocer conceptos que no le corresponden.
 *
 * `projectId`, cuando está presente, se resuelve como filtro SQL
 * (`WHERE project_id = $1`) antes de la búsqueda HNSW, no como un filtro en
 * memoria después de traer candidatos — reduce el espacio de búsqueda en
 * vez de descartar resultados ya traídos.
 *
 * `limit` es el tamaño del *candidate pool*, no el `topK` final que el
 * usuario pidió: debe ser mayor (ver `IMemoryRanker` y la nota sobre
 * candidateK > topK) para que el ranking híbrido tenga margen real para
 * reordenar en vez de operar solo sobre los N más similares
 * semánticamente.
 */
export interface MemorySemanticQuery {
  readonly embedding: readonly number[];
  readonly projectId?: string;
  readonly limit: number;
}
