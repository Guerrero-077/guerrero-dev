/**
 * Razón normalizada de fallo de `GitToolHandler`. Mismo criterio que
 * `CodeIntelligenceToolHandlerError`: solo se declara la razón que el
 * handler realmente produce hoy. Fallos de `IGitWorkingTreeSource` no se
 * reenvuelven aquí: se propagan con su propio tipo (`GitWorkingTreeSourceError`).
 */
export type GitToolHandlerErrorReason = "unknown_tool" | "invalid_input";

/** Error tipado que encapsula un fallo de dispatch de `GitToolHandler`. */
export class GitToolHandlerError extends Error {
  constructor(
    readonly reason: GitToolHandlerErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GitToolHandlerError";
  }
}
