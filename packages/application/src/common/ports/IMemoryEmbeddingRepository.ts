import type { MemoryEmbedding } from "@guerrero-dev/domain";

/**
 * Puerto de persistencia de embeddings de memoria (Fase 4.5 §14c).
 *
 * Deliberadamente sin `searchSimilar()` todavía: ese método pertenece
 * conceptualmente a Retrieval (Fase 4.6), no a Persistence. Este puerto
 * solo sabe guardar, leer y borrar — no sabe qué significa "similar".
 *
 * `findByMemoryId` devuelve un array (no `| null`) porque una misma memoria
 * puede tener más de un embedding coexistiendo (distintos providers/modelos
 * durante una migración futura — ver JSDoc de `MemoryEmbedding`).
 */
export interface IMemoryEmbeddingRepository {
  create(embedding: MemoryEmbedding): Promise<MemoryEmbedding>;
  findByMemoryId(memoryId: string): Promise<MemoryEmbedding[]>;
  deleteByMemoryId(memoryId: string): Promise<void>;
}
