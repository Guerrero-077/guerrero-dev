import { doublePrecision, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects.js";

/**
 * Debe reflejar exactamente la migración 0002_memory_tables.sql (Fase
 * 4.3). Los CHECK constraints (confidence/importance 0..1, scope válido,
 * consistencia scope<->project_id) viven en el SQL, no aquí — Drizzle es
 * solo la capa de queries tipadas.
 *
 * confidence/importance en `doublePrecision`, no `real`: ver comentario en
 * la migración sobre round-trip bit-exacto (JS y PostgreSQL usan IEEE 754
 * de 64 bits).
 */
export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  importance: doublePrecision("importance").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
