import { randomUUID } from "node:crypto";
import type { Project, Result } from "@guerrero-dev/domain";
import { failure, success } from "@guerrero-dev/domain";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import type { IProjectRepository } from "../common/ports/IProjectRepository.js";

export interface AddProjectInput {
  name: string;
  path: string;
}

/**
 * Caso de uso: registrar un proyecto nuevo. Construye la entidad
 * `Project` completa (id, timestamps) antes de pedirle al repositorio que
 * la persista — el repositorio no decide identidad ni defaults.
 */
export class AddProject {
  constructor(
    private readonly repository: IProjectRepository,
    private readonly logger: ILogger = noopLogger,
  ) {}

  async execute(input: AddProjectInput): Promise<Result<Project>> {
    const name = input.name.trim();
    const path = input.path.trim();

    if (!name || !path) {
      return failure(new Error("name y path son requeridos"));
    }

    const now = new Date();
    const project: Project = {
      id: randomUUID(),
      name,
      path,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.repository.create(project);
    this.logger.info({ projectId: created.id }, "Proyecto creado");
    return success(created);
  }
}
