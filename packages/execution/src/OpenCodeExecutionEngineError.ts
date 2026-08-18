/**
 * Razón normalizada de fallo de `OpenCodeExecutionEngine` (Fase 5.5,
 * 5.5b). Mismo criterio que `TsMorphCodeAnalyzerError`/`OllamaProviderError`/
 * `CodeIntelligenceToolHandlerError`: solo se declara la razón que el
 * engine realmente produce hoy. `"request_failed"` cubre una respuesta
 * de `@opencode-ai/sdk` con `error` a nivel de transporte/protocolo (p.
 * ej. 400 Bad Request) — distinto de un `AssistantMessage.error`
 * semántico (turno de sesión fallido), que se mapea a
 * `ExecutionResult.status: "failed"`, no a esta excepción.
 * `"missing_policy_context"` (Fase 5.5b) cubre `execute()` invocado sin
 * un `plan()` previo para esa sesión — invariante real de esta clase,
 * no del orquestador que la usa. Un rechazo de la promesa del propio
 * cliente (red caída, servidor no arrancó) no se reenvuelve aquí: se
 * propaga con su propio tipo.
 */
export type OpenCodeExecutionEngineErrorReason = "request_failed" | "missing_policy_context";

/** Error tipado que encapsula un fallo de transporte/protocolo de `OpenCodeExecutionEngine`. */
export class OpenCodeExecutionEngineError extends Error {
  constructor(
    readonly reason: OpenCodeExecutionEngineErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenCodeExecutionEngineError";
  }
}
