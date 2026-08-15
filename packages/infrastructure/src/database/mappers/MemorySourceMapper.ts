import type { MemorySource } from "@guerrero-dev/domain";
import type { memorySources } from "../schema/memorySources.js";

type MemorySourceRow = typeof memorySources.$inferSelect;
type MemorySourceInsert = typeof memorySources.$inferInsert;

/** DB row <-> Domain entity para `memory_sources` (Fase 4.3 §11-12). */
export const MemorySourceMapper = {
  toDomain(row: MemorySourceRow): MemorySource {
    return {
      id: row.id,
      memoryId: row.memoryId,
      sourceType: row.sourceType as MemorySource["sourceType"],
      sourceReference: row.sourceReference,
      excerpt: row.excerpt,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  },

  toRow(source: MemorySource): MemorySourceInsert {
    return {
      id: source.id,
      memoryId: source.memoryId,
      sourceType: source.sourceType,
      sourceReference: source.sourceReference,
      excerpt: source.excerpt,
      metadata: source.metadata,
      createdAt: source.createdAt,
    };
  },
};
