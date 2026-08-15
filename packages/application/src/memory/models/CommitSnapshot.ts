/**
 * Datos crudos de un commit real, sin interpretar (Fase 4.8). Lo que
 * produce el "Commit Collector" del pipeline — sin lógica de análisis,
 * sin acceso a memoria persistida. Deliberadamente mínimo: el golden
 * dataset (`docs/benchmarks/candidate-detection/`) debe guiar qué campos
 * se agregan después, no una lista especulativa de "por si acaso".
 */
export interface CommitSnapshot {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly timestamp: Date;
  readonly diff: string;
  readonly changedFiles: readonly string[];
}
