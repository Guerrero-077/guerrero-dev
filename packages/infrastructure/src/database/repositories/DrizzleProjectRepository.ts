import { desc, eq } from "drizzle-orm";
import type { Project } from "@guerrero-dev/domain";
import type { IProjectRepository } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { projects } from "../schema/projects.js";

type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** `IProjectRepository` sobre Drizzle + la tabla `projects` (migración 0001). */
export class DrizzleProjectRepository implements IProjectRepository {
  constructor(private readonly db: DrizzleClient) {}

  async create(project: Project): Promise<Project> {
    const [row] = await this.db
      .insert(projects)
      .values({
        id: project.id,
        name: project.name,
        path: project.path,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })
      .returning();

    if (!row) {
      throw new Error("INSERT en projects no devolvió ninguna fila");
    }
    return toProject(row);
  }

  async findById(id: string): Promise<Project | null> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id));
    return row ? toProject(row) : null;
  }

  async findAll(): Promise<Project[]> {
    const rows = await this.db.select().from(projects).orderBy(desc(projects.createdAt));
    return rows.map(toProject);
  }
}
