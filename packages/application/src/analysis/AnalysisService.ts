import type { Project } from "@guerrero-dev/domain";
import type { IProjectRepository } from "../common/ports/IProjectRepository.js";

export interface ProjectAnalysisSummary {
  project: Project;
  /** Placeholder: el análisis real (AST/símbolos/grafo) llega en Fase 5-6. */
  status: "not_analyzed";
}

/**
 * Caso de uso de análisis de proyecto. Placeholder de Fase 3 — hoy solo
 * confirma que el proyecto existe; el AST, los símbolos, el grafo de
 * dependencias y el RAG de código (`@guerrero-dev/project-intelligence`)
 * llegan en Fase 5-6.
 */
export class AnalysisService {
  constructor(private readonly projectRepository: IProjectRepository) {}

  async analyze(projectId: string): Promise<ProjectAnalysisSummary | null> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) return null;

    return { project, status: "not_analyzed" };
  }
}
