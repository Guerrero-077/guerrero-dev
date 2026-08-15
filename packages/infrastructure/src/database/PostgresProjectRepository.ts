import type { Project } from "@guerrero-dev/domain";
import type { CreateProjectInput, IProjectRepository } from "@guerrero-dev/application";
import type { PgPool } from "./pool.js";

interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  created_at: Date;
  updated_at: Date;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `IProjectRepository` sobre la tabla `projects` (migración 0001). */
export class PostgresProjectRepository implements IProjectRepository {
  constructor(private readonly pool: PgPool) {}

  async findAll(): Promise<Project[]> {
    const { rows } = await this.pool.query<ProjectRow>(
      "SELECT id, name, root_path, created_at, updated_at FROM projects ORDER BY created_at DESC",
    );
    return rows.map(toProject);
  }

  async findById(id: string): Promise<Project | null> {
    const { rows } = await this.pool.query<ProjectRow>(
      "SELECT id, name, root_path, created_at, updated_at FROM projects WHERE id = $1",
      [id],
    );
    return rows[0] ? toProject(rows[0]) : null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const { rows } = await this.pool.query<ProjectRow>(
      `INSERT INTO projects (name, root_path)
       VALUES ($1, $2)
       RETURNING id, name, root_path, created_at, updated_at`,
      [input.name, input.rootPath],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("INSERT en projects no devolvió ninguna fila");
    }
    return toProject(row);
  }
}
