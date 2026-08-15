import { customType, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { memories } from "./memories.js";

/**
 * pgvector `vector` sin dimensión fija todavía (Fase 4.3 §6-9):
 * drizzle-orm no expone un tipo nativo para un `vector` sin dimensión, así
 * que se declara como `customType`. Cuando Fase 4.4 elija el embedding
 * provider y su dimensión real, este customType se reemplaza por el tipo
 * `vector(N)` correspondiente (o se mantiene, según lo que soporte
 * drizzle-orm en ese momento).
 */
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector";
  },
});

/**
 * Debe reflejar exactamente la migración 0002_memory_tables.sql. Tabla
 * provisional: todavía no tiene repository ni mapper — se agregan en Fase
 * 4.4 junto con el embedding provider real, la dimensión y el índice
 * HNSW/IVFFlat.
 */
export const memoryEmbeddings = pgTable("memory_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoryId: uuid("memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull(),
  embedding: vector("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
