/**
 * Razón normalizada de fallo de `CodeIntelligenceToolHandler` (Fase 5.4b).
 * Mismo criterio que `TsMorphCodeAnalyzerError`/`GitTrackedFilesSourceError`/
 * `OllamaProviderError`: solo se declara la razón que el handler realmente
 * produce hoy. Fallos de `ICodeAnalyzer`/`ICodeLiteralSearch` no se
 * reenvuelven aquí: se propagan con su propio tipo.
 */
export type CodeIntelligenceToolHandlerErrorReason = "unknown_tool" | "invalid_input";

/** Error tipado que encapsula un fallo de dispatch de `CodeIntelligenceToolHandler`. */
export class CodeIntelligenceToolHandlerError extends Error {
  constructor(
    readonly reason: CodeIntelligenceToolHandlerErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CodeIntelligenceToolHandlerError";
  }
}
