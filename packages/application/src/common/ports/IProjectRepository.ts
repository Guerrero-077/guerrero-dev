import type { Project } from "@guerrero-dev/domain";

export interface CreateProjectInput {
  name: string;
  rootPath: string;
}

/**
 * Contrato de persistencia de proyectos. `PostgresProjectRepository`
 * (`infrastructure/database`) es la implementación real, sobre la tabla
 * `projects` creada en la migración 0001.
 */
export interface IProjectRepository {
  findAll(): Promise<Project[]>;

  findById(id: string): Promise<Project | null>;

  create(input: CreateProjectInput): Promise<Project>;
}
