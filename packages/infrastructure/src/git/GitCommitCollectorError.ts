/**
 * Razones normalizadas de fallo de `GitCommitCollector` (Fase 4.8, Commit
 * Collector). Mismo criterio que `GitHistorySourceError` (Fase 4.8.3): el
 * dominio nunca ve `ChildProcess`, `stderr` crudo, ni exit codes.
 *
 * Tipo separado de `GitHistorySourceError` a propósito, no una extensión
 * ni una reutilización — `GitCommitCollector` tiene un modo de fallo que
 * `GitHistorySource` no tiene (`"commit_not_found"`: `IGitHistorySource`
 * nunca falla por "sha inexistente", solo devuelve listas vacías, porque
 * consulta por path/rename, no por un commit específico). Reusar el tipo
 * existente para agregarle un caso nuevo habría sido modificar un
 * contrato ya cerrado de Fase 4.8.3 fuera del alcance de este commit.
 */
export type GitCommitCollectorErrorReason =
  "git_not_found" | "not_a_repository" | "commit_not_found" | "timeout" | "invalid_output" | "unknown";

/**
 * Error tipado que encapsula cualquier fallo de `GitCommitCollector` al
 * invocar Git real. `cause` conserva el error original (nunca se
 * descarta información, solo se envuelve).
 */
export class GitCommitCollectorError extends Error {
  constructor(
    readonly reason: GitCommitCollectorErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GitCommitCollectorError";
  }
}
