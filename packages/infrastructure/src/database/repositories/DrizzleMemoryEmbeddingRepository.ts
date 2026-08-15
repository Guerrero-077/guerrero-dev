import { eq } from "drizzle-orm";
import type { MemoryEmbedding } from "@guerrero-dev/domain";
import type { IMemoryEmbeddingRepository } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { MemoryEmbeddingMapper } from "../mappers/MemoryEmbeddingMapper.js";
import { memoryEmbeddings } from "../schema/memoryEmbeddings.js";

/**
 * `IMemoryEmbeddingRepository` sobre Drizzle + la tabla `memory_embeddings`
 * (migraciones 0002 + 0003, `vector(1024)` con índice HNSW). Sin
 * `searchSimilar()` — ver JSDoc del puerto: eso es Fase 4.6 (Retrieval).
 */
export class DrizzleMemoryEmbeddingRepository implements IMemoryEmbeddingRepository {
  constructor(private readonly db: DrizzleClient) {}

  async create(embedding: MemoryEmbedding): Promise<MemoryEmbedding> {
    const [row] = await this.db
      .insert(memoryEmbeddings)
      .values(MemoryEmbeddingMapper.toRow(embedding))
      .returning();
    if (!row) {
      throw new Error("INSERT en memory_embeddings no devolvió ninguna fila");
    }
    return MemoryEmbeddingMapper.toDomain(row);
  }

  async findByMemoryId(memoryId: string): Promise<MemoryEmbedding[]> {
    const rows = await this.db.select().from(memoryEmbeddings).where(eq(memoryEmbeddings.memoryId, memoryId));
    return rows.map(MemoryEmbeddingMapper.toDomain);
  }

  async deleteByMemoryId(memoryId: string): Promise<void> {
    await this.db.delete(memoryEmbeddings).where(eq(memoryEmbeddings.memoryId, memoryId));
  }
}
