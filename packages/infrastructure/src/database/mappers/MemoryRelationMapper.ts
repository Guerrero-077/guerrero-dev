import type { MemoryRelation } from "@guerrero-dev/domain";
import type { memoryRelations } from "../schema/memoryRelations.js";

type MemoryRelationRow = typeof memoryRelations.$inferSelect;
type MemoryRelationInsert = typeof memoryRelations.$inferInsert;

/** DB row <-> Domain entity para `memory_relations` (Fase 4.3 §11-12). */
export const MemoryRelationMapper = {
  toDomain(row: MemoryRelationRow): MemoryRelation {
    return {
      id: row.id,
      sourceMemoryId: row.sourceMemoryId,
      targetMemoryId: row.targetMemoryId,
      relationType: row.relationType as MemoryRelation["relationType"],
      confidence: row.confidence,
      createdAt: row.createdAt,
    };
  },

  toRow(relation: MemoryRelation): MemoryRelationInsert {
    return {
      id: relation.id,
      sourceMemoryId: relation.sourceMemoryId,
      targetMemoryId: relation.targetMemoryId,
      relationType: relation.relationType,
      confidence: relation.confidence,
      createdAt: relation.createdAt,
    };
  },
};
