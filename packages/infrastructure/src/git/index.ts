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
 * `GitWorkingTreeSource`: implementación real de `IGitWorkingTreeSource`
 * (application/git-tools) — status/diff/log del working tree actual,
 * expuesta al agente como servidor MCP (`@guerrero-dev/mcp`,
 * `GitMcpServer`). Cierra el gap que este mismo JSDoc documentaba antes
 * ("el resto de operaciones de git... se agregan cuando haya un caso de
 * uso concreto"); `commit`/`branch` siguen sin implementación, misma
 * condición.
 */
export * from "./GitCommitCollector.js";
export * from "./GitCommitCollectorError.js";
export * from "./GitHistorySource.js";
export * from "./GitHistorySourceError.js";
export * from "./GitTrackedFilesSource.js";
export * from "./GitTrackedFilesSourceError.js";
export * from "./GitWorkingTreeSource.js";
export * from "./GitWorkingTreeSourceError.js";
export * from "./parseGitLog.js";
export * from "./parseGitStatus.js";
