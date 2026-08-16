/**
 * Razón normalizada de fallo de `TsMorphCodeAnalyzer` (Fase 6.3). Mismo
 * criterio que `GitTrackedFilesSourceError`/`FileReaderError`: solo se
 * declara la razón que el análisis realmente produce hoy — no un
 * catálogo especulativo. Los fallos de `IGitTrackedFilesSource`/
 * `IFileReader` no se reenvuelven aquí: se propagan con su propio tipo.
 */
export type TsMorphCodeAnalyzerErrorReason = "syntax_error";

/** Error tipado que encapsula un fallo de análisis sintáctico de `TsMorphCodeAnalyzer`. */
export class TsMorphCodeAnalyzerError extends Error {
  constructor(
    readonly reason: TsMorphCodeAnalyzerErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TsMorphCodeAnalyzerError";
  }
}
