import type { Memory } from "@guerrero-dev/domain";
import type { memories } from "../schema/memories.js";

type MemoryRow = typeof memories.$inferSelect;
type MemoryInsert = typeof memories.$inferInsert;

/**
 * DB row <-> Domain entity (Fase 4.3 §11-12), explícito y no implícito: si
 * Drizzle o el schema cambian de forma, el dominio no se entera — solo
 * cambia este mapper. La infraestructura se adapta al dominio, no al
 * revés.
 *
 * Los `as Memory[...]` en `toDomain` son seguros porque los CHECK
 * constraints de la migración (memories_scope_valid, memories_type_valid,
 * memories_status_valid) garantizan que `scope`/`type`/`status` en la fila
 * ya son uno de los valores válidos — la validación real ocurre en
 * PostgreSQL, no aquí.
 */
export const MemoryMapper = {
  toDomain(row: MemoryRow): Memory {
    return {
      id: row.id,
      projectId: row.projectId,
      scope: row.scope as Memory["scope"],
      type: row.type as Memory["type"],
      content: row.content,
      status: row.status as Memory["status"],
      confidence: row.confidence,
      importance: row.importance,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastVerifiedAt: row.lastVerifiedAt,
      expiresAt: row.expiresAt,
    };
  },

  toRow(memory: Memory): MemoryInsert {
    return {
      id: memory.id,
      projectId: memory.projectId,
      scope: memory.scope,
      type: memory.type,
      content: memory.content,
      status: memory.status,
      confidence: memory.confidence,
      importance: memory.importance,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      lastVerifiedAt: memory.lastVerifiedAt,
      expiresAt: memory.expiresAt,
    };
  },
};
