import type { CodeIndex } from "@guerrero-dev/domain";

/**
 * Analiza el árbol .ts trackeado de un repositorio (Fase 6, mapa §6/§8).
 * `repoRoot` es la única entrada — cómo se descubren los archivos
 * (`IGitTrackedFilesSource`) es responsabilidad exclusiva de quien
 * implementa este puerto (`infrastructure/code-intelligence`, 6.3).
 */
export interface ICodeAnalyzer {
  analyze(repoRoot: string): Promise<CodeIndex>;
}
