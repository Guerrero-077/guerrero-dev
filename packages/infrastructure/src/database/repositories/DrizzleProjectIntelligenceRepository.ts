import { eq } from "drizzle-orm";
import type { ProjectProfile } from "@guerrero-dev/domain";
import type { IProjectIntelligenceRepository } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { ProjectProfileMapper } from "../mappers/ProjectProfileMapper.js";
import { projectProfiles } from "../schema/projectProfiles.js";

/**
 * `IProjectIntelligenceRepository` sobre Drizzle + la tabla
 * `project_profiles` (migración 0004, Fase 5.6).
 *
 * `upsert` hace `INSERT ... ON CONFLICT (project_id) DO UPDATE`, primer
 * UPSERT real de este repo (sin precedente que copiar de `Drizzle*Repository`
 * existentes, que solo hacen `INSERT` puro). `id`/`projectId` quedan
 * deliberadamente fuera del `set`: un re-scan no crea otra identidad de
 * `ProjectProfile`, actualiza el snapshot vigente del mismo perfil — por
 * eso el `id` devuelto puede diferir del que traía `profile` si ya existía
 * una fila previa para ese `projectId`.
 */
export class DrizzleProjectIntelligenceRepository implements IProjectIntelligenceRepository {
  constructor(private readonly db: DrizzleClient) {}

  async upsert(profile: ProjectProfile): Promise<ProjectProfile> {
    const row = ProjectProfileMapper.toRow(profile);

    const [result] = await this.db
      .insert(projectProfiles)
      .values(row)
      .onConflictDoUpdate({
        target: projectProfiles.projectId,
        set: {
          schemaVersion: row.schemaVersion,
          scannedAt: row.scannedAt,
          technologies: row.technologies,
          components: row.components,
          dependencies: row.dependencies,
          structure: row.structure,
          configuration: row.configuration,
        },
      })
      .returning();

    if (!result) {
      throw new Error("UPSERT en project_profiles no devolvió ninguna fila");
    }
    return ProjectProfileMapper.toDomain(result);
  }

  async findByProjectId(projectId: string): Promise<ProjectProfile | null> {
    const [row] = await this.db
      .select()
      .from(projectProfiles)
      .where(eq(projectProfiles.projectId, projectId));
    return row ? ProjectProfileMapper.toDomain(row) : null;
  }
}
