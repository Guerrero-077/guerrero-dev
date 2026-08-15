import type { MemoryEmbedding } from "@guerrero-dev/domain";
import type { memoryEmbeddings } from "../schema/memoryEmbeddings.js";

type MemoryEmbeddingRow = typeof memoryEmbeddings.$inferSelect;
type MemoryEmbeddingInsert = typeof memoryEmbeddings.$inferInsert;

/** DB row <-> Domain entity para `memory_embeddings` (Fase 4.5 §14c). */
export const MemoryEmbeddingMapper = {
  toDomain(row: MemoryEmbeddingRow): MemoryEmbedding {
    return {
      id: row.id,
      memoryId: row.memoryId,
      embedding: row.embedding,
      provider: row.provider,
      model: row.model,
      dimensions: row.dimensions,
      createdAt: row.createdAt,
    };
  },

  toRow(embedding: MemoryEmbedding): MemoryEmbeddingInsert {
    return {
      id: embedding.id,
      memoryId: embedding.memoryId,
      embedding: [...embedding.embedding],
      provider: embedding.provider,
      model: embedding.model,
      dimensions: embedding.dimensions,
      createdAt: embedding.createdAt,
    };
  },
};
