import type { Project } from "@guerrero-dev/domain";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import type { CreateProjectInput, IProjectRepository } from "../common/ports/IProjectRepository.js";

/**
 * Caso de uso de proyectos. Depende únicamente de `IProjectRepository`
 * (puerto de Application) — no sabe si detrás hay PostgreSQL, un archivo,
 * o memoria en proceso.
 */
export class ProjectService {
  constructor(
    private readonly repository: IProjectRepository,
    private readonly logger: ILogger = noopLogger,
  ) {}

  async listProjects(): Promise<Project[]> {
    return this.repository.findAll();
  }

  async getProject(id: string): Promise<Project | null> {
    return this.repository.findById(id);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const project = await this.repository.create(input);
    this.logger.info({ projectId: project.id }, "Proyecto creado");
    return project;
  }
}
