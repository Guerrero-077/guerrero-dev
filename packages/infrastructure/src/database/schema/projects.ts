import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Debe reflejar exactamente la migración 0001_init.sql. Drizzle se usa
 * aquí solo como capa de queries tipadas — el DDL sigue siendo SQL escrito
 * a mano (ver docs/fase-3-implementacion.md): no queremos que la capa de
 * persistencia esconda PostgreSQL/pgvector.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
