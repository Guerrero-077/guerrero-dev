/**
 * infrastructure/git
 *
 * `GitHistorySource` (Fase 4.8.3): implementación real de
 * `IGitHistorySource` (application/memory) vía shell directo a Git
 * (`execFile`). `GitCommitCollector` (Fase 4.8, Commit Collector):
 * implementación real de `ICommitCollector` — traduce un commit real de
 * Git a `CommitSnapshot`, la pieza que faltaba para alimentar el resto
 * del pipeline de Candidate Detection con datos reales en vez de fixtures
 * a mano. `GitTrackedFilesSource` (Fase 5.2): implementación real de
 * `IGitTrackedFilesSource` (application/common) — traduce `git ls-files -z`
 * a rutas relativas validadas, la fuente primaria de Project Intelligence.
 * El resto de operaciones de git (status, commit, branch) para agent-core
 * siguen sin implementación, se agregan cuando haya un caso de uso
 * concreto que las requiera.
 */
export * from "./GitCommitCollector.js";
export * from "./GitCommitCollectorError.js";
export * from "./GitHistorySource.js";
export * from "./GitHistorySourceError.js";
export * from "./GitTrackedFilesSource.js";
export * from "./GitTrackedFilesSourceError.js";
