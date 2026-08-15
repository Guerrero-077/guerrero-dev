/**
 * infrastructure/git
 *
 * `GitHistorySource` (Fase 4.8.3): implementación real de
 * `IGitHistorySource` (application/memory) vía shell directo a Git
 * (`execFile`). Primer caso de uso concreto del área — el resto de
 * operaciones de git (status, diff, commit, branch) para agent-core y
 * project-intelligence siguen sin implementación, se agregan cuando haya
 * un caso de uso concreto que las requiera.
 */
export * from "./GitHistorySource.js";
export * from "./GitHistorySourceError.js";
