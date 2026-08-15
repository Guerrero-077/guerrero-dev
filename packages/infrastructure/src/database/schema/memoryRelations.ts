import { doublePrecision, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { memories } from "./memories.js";

/** Debe reflejar exactamente la migración 0002_memory_tables.sql (Fase 4.3). */
export const memoryRelations = pgTable("memory_relations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceMemoryId: uuid("source_memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  targetMemoryId: uuid("target_memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
