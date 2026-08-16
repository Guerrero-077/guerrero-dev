/**
 * Razones normalizadas de fallo de `GitTrackedFilesSource` (Fase 5.2).
 * Mismo shape que `GitHistorySourceError`: el consumidor (`ProjectProfileScanner`,
 * 5.7) nunca ve `ChildProcess`, stderr crudo ni exit codes, solo este tipo
 * ya traducido. El adapter informa la razón; la política de qué hacer con
 * cada una (ignorar, loguear, propagar) queda para quien lo consuma.
 */
export type GitTrackedFilesSourceErrorReason =
  "git_not_found" | "not_a_repository" | "timeout" | "invalid_output" | "unknown";

/** Error tipado que encapsula cualquier fallo de `GitTrackedFilesSource` al invocar Git real. */
export class GitTrackedFilesSourceError extends Error {
  constructor(
    readonly reason: GitTrackedFilesSourceErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GitTrackedFilesSourceError";
  }
}
