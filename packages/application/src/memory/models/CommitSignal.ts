import type { CommitReference } from "./CommitReference.js";
import type { CommitSnapshot } from "./CommitSnapshot.js";

/**
 * Representación analítica de un `CommitSnapshot` (Fase 4.8) — lo que
 * produce `ICommitAnalyzer`. No es una copia de Git, es la extracción de
 * las features que el golden dataset mostró útiles: magnitud, paths
 * tocados, y contexto histórico estructural (para que `ICandidateExtractor`
 * intente relaciones temporales tipo `supersedes`/`reinforces`, ver
 * `docs/benchmarks/candidate-detection/taxonomy.md`).
 *
 * Deliberadamente NO consulta memoria persistida (`IMemoryRepository`,
 * `IMemoryCandidateRetriever`, embeddings) — "¿esto ya lo sabemos?" es una
 * pregunta que responde exclusivamente Fase 4.7
 * (`IMemoryCandidateDeduplicator`/`IMemoryConflictDetector`), nunca el
 * analyzer. Esto también significa que `ICommitAnalyzer` puede correr
 * sobre un repositorio Git sin que exista PostgreSQL — útil para
 * benchmarking y para procesar históricos.
 *
 * Tampoco incluye `generatedFileRatio` ni ninguna heurística de
 * clasificación de paths: reconocer patrones conocidos (archivos
 * generados, docs triviales, etc.) es responsabilidad de
 * `ICommitNoiseFilter`, no del analyzer.
 */
export interface CommitSignal {
  readonly commit: CommitSnapshot;
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly touchedPaths: readonly string[];
  /**
   * Commits recientes encontrados por heurística estructural (overlap de
   * paths/directorio, continuidad de renombrado) — NO relaciones semánticas
   * confirmadas. Ver `CommitReference` para la frontera exacta de qué
   * heurísticas aplican y por qué (deliberadamente no incluye mismo autor,
   * ventana temporal, ni carpeta-como-proxy-de-feature: eso mezclaría
   * "estructura observable" con "significado arquitectónico" dentro del
   * analyzer). Interpretar si una referencia es realmente `reinforces`,
   * `supersedes`, u otra relación es trabajo de `ICandidateExtractor`.
   */
  readonly recentRelatedCommits: readonly CommitReference[];
}
