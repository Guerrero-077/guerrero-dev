import type { ProjectProfile } from "@guerrero-dev/domain";
import type { projectProfiles } from "../schema/projectProfiles.js";

export type ProjectProfileRow = typeof projectProfiles.$inferSelect;
type ProjectProfileInsert = typeof projectProfiles.$inferInsert;

/**
 * DB row <-> Domain entity para `project_profiles` (Fase 5.6). La
 * infraestructura se adapta al dominio, no al revés — mismo criterio que
 * `MemoryMapper`.
 *
 * A diferencia del resto de mappers de este repo, `technologies`/
 * `components`/`dependencies`/`structure`/`configuration` no son campos
 * escalares: son exactamente lo que Drizzle ya deserializó de JSONB
 * (`.$type<T>()` en el schema es solo una aserción de compilación). No se
 * re-valida aquí contra `isValidTechnology`/`isValidComponent` — la única
 * vía de escritura es `toRow`, alimentado por objetos que ya pasaron esos
 * invariantes antes de llegar al repository.
 */
export const ProjectProfileMapper = {
  toDomain(row: ProjectProfileRow): ProjectProfile {
    return {
      id: row.id,
      projectId: row.projectId,
      schemaVersion: row.schemaVersion,
      scannedAt: row.scannedAt,
      technologies: row.technologies,
      components: row.components,
      dependencies: row.dependencies,
      structure: row.structure,
      configuration: row.configuration,
    };
  },

  toRow(profile: ProjectProfile): ProjectProfileInsert {
    return {
      id: profile.id,
      projectId: profile.projectId,
      schemaVersion: profile.schemaVersion,
      scannedAt: profile.scannedAt,
      technologies: profile.technologies,
      components: profile.components,
      dependencies: profile.dependencies,
      structure: profile.structure,
      configuration: profile.configuration,
    };
  },
};
