import type { Project } from "@guerrero-dev/domain";
import type { IProjectRepository } from "../common/ports/IProjectRepository.js";

/** Caso de uso: listar todos los proyectos registrados. */
export class ListProjects {
  constructor(private readonly repository: IProjectRepository) {}

  async execute(): Promise<Project[]> {
    return this.repository.findAll();
  }
}
