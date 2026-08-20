/**
 * Razones normalizadas de fallo de `GitWorkingTreeSource`. Mismo criterio
 * que `GitHistorySourceError`/`GitTrackedFilesSourceError`: el consumidor
 * (`GitToolHandler`, application) nunca ve `ChildProcess`, `stderr` crudo,
 * ni exit codes — solo este tipo, ya traducido.
 */
export type GitWorkingTreeSourceErrorReason =
  "git_not_found" | "not_a_repository" | "timeout" | "invalid_output" | "unknown";

/**
 * Error tipado que encapsula cualquier fallo de `GitWorkingTreeSource` al
 * invocar Git real. `cause` conserva el error original (nunca se descarta
 * información, solo se envuelve) para debugging, sin exponer su forma en
 * el contrato.
 */
export class GitWorkingTreeSourceError extends Error {
  constructor(
    readonly reason: GitWorkingTreeSourceErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GitWorkingTreeSourceError";
  }
}
