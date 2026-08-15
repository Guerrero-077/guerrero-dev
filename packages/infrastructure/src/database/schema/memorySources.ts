import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { memories } from "./memories.js";

/** Debe reflejar exactamente la migración 0002_memory_tables.sql (Fase 4.3). */
export const memorySources = pgTable("memory_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoryId: uuid("memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceReference: text("source_reference").notNull(),
  excerpt: text("excerpt"),
  metadata: jsonb("metadata").notNull().default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
