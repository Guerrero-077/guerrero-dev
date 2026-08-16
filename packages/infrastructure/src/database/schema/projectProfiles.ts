import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ProjectComponent, ProjectDependency, Technology } from "@guerrero-dev/domain";
import { projects } from "./projects.js";

/**
 * Debe reflejar exactamente la migración 0004_project_profiles.sql (Fase
 * 5.6). El CHECK de `schema_version` vive en el SQL, no aquí — Drizzle es
 * solo la capa de queries tipadas (mismo criterio que `memories.ts`).
 *
 * `.$type<T>()` en las columnas JSONB es una aserción de compilación, no
 * valida el JSON en runtime — la única vía de escritura a esta tabla es
 * `ProjectProfileMapper.toRow`, alimentado exclusivamente por objetos que
 * ya pasaron `isValidTechnology`/`isValidComponent` (dominio, 5.1) antes de
 * llegar aquí.
 *
 * `id` propio + `projectId` único: identidad del snapshot persistente vs.
 * identidad del proyecto al que pertenece son conceptos distintos, aunque
 * v1 no tenga histórico (decisión congelada de 5.6, consistente con
 * `ProjectProfile extends Entity` en el dominio).
 */
export const projectProfiles = pgTable("project_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  schemaVersion: integer("schema_version").notNull(),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
  technologies: jsonb("technologies").notNull().default([]).$type<readonly Technology[]>(),
  components: jsonb("components").notNull().default([]).$type<readonly ProjectComponent[]>(),
  dependencies: jsonb("dependencies").notNull().default([]).$type<readonly ProjectDependency[]>(),
  structure: jsonb("structure").notNull().default([]).$type<readonly string[]>(),
  configuration: jsonb("configuration").notNull().default({}).$type<Record<string, unknown>>(),
});
