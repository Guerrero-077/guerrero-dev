import { eq, sql } from "drizzle-orm";
import type {
  IMemoryCandidateRetriever,
  MemorySearchCandidate,
  MemorySemanticQuery,
} from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { MemoryMapper } from "../mappers/MemoryMapper.js";
import { memories } from "../schema/memories.js";
import { memoryEmbeddings } from "../schema/memoryEmbeddings.js";

/**
 * `IMemoryCandidateRetriever` sobre Drizzle + pgvector (Fase 4.6). Única
 * responsabilidad: `vector + filtros + límite -> candidatos ordenados por
 * similitud`. Nada de ranking híbrido acá — eso es `IMemoryRanker`
 * (Application), que ni siquiera sabe que este adapter existe.
 *
 * Filtro de `projectId` resuelto en SQL (`WHERE project_id = $1`, antes de
 * ordenar por distancia), no en memoria después de traer filas — reduce el
 * espacio de búsqueda en vez de descartar candidatos ya traídos.
 *
 * Deliberadamente sin filtro por `type`/`scope` todavía: `MemorySemanticQuery`
 * (Fase 4.6, acordado explícitamente) solo expone `embedding` + `projectId`
 * + `limit`. Ese filtrado, cuando hace falta, se aplica como post-filtro en
 * `MemoryRetriever` (Application) sobre el candidate pool — mantiene este
 * adapter ajustado exactamente al contrato acordado en vez de crecerlo por
 * las suyas.
 */
export class DrizzleMemoryCandidateRetriever implements IMemoryCandidateRetriever {
  constructor(private readonly db: DrizzleClient) {}

  async findCandidates(query: MemorySemanticQuery): Promise<MemorySearchCandidate[]> {
    const queryVector = toVectorLiteral(query.embedding);

    // Cosine distance de pgvector: 0 = idéntico, 2 = opuesto. La conversión
    // a `semanticSimilarity` (1 - distance, rango útil 0..1 para vectores
    // normalizados) se hace acá y solo acá — Application recibe un número
    // "más alto es más similar" y nunca se entera de `<=>` ni de
    // `vector_cosine_ops`.
    const distance = sql<number>`${memoryEmbeddings.embedding} <=> ${queryVector}::vector`;

    const rows = await this.db
      .select({ memory: memories, distance })
      .from(memoryEmbeddings)
      .innerJoin(memories, eq(memories.id, memoryEmbeddings.memoryId))
      .where(query.projectId !== undefined ? eq(memories.projectId, query.projectId) : undefined)
      .orderBy(distance)
      .limit(query.limit);

    return rows.map((row): MemorySearchCandidate => ({
      memory: MemoryMapper.toDomain(row.memory),
      semanticSimilarity: 1 - row.distance,
    }));
  }
}

/** `number[]` -> literal de texto pgvector (`"[0.1,0.2,...]"`), mismo formato que `OllamaEmbeddingProvider`/el customType de Fase 4.5. */
function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(",")}]`;
}
