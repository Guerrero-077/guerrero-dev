import type { Project } from "@guerrero-dev/domain";
import type { IProjectRepository } from "../common/ports/IProjectRepository.js";

/** Caso de uso: obtener un proyecto por id. */
export class GetProject {
  constructor(private readonly repository: IProjectRepository) {}

  async execute(id: string): Promise<Project | null> {
    return this.repository.findById(id);
  }
}
