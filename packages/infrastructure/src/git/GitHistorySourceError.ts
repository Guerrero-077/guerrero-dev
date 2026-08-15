/**
 * Razones normalizadas de fallo de `GitHistorySource` (Fase 4.8.3). El
 * dominio (`DeterministicCommitAnalyzer`) nunca ve `ChildProcess`, `stderr`
 * crudo, ni exit codes — solo este tipo, ya traducido.
 */
export type GitHistorySourceErrorReason =
  "git_not_found" | "not_a_repository" | "timeout" | "invalid_output" | "unknown";

/**
 * Error tipado que encapsula cualquier fallo de `GitHistorySource` al
 * invocar Git real. `cause` conserva el error original de `execFile`
 * (nunca se descarta información, solo se envuelve) para debugging, sin
 * exponer su forma en el contrato.
 */
export class GitHistorySourceError extends Error {
  constructor(
    readonly reason: GitHistorySourceErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GitHistorySourceError";
  }
}
