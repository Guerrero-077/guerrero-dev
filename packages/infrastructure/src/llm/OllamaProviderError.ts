/**
 * Razones normalizadas de fallo de `OllamaProvider` (Fase 5.1). Mismo
 * criterio que `GitTrackedFilesSourceError`/`FileReaderError`: tipo
 * propio, con `reason` + `cause`, en vez de un `Error` genérico.
 */
export type OllamaProviderErrorReason = "unreachable" | "timeout" | "http_error" | "invalid_response";

/** Error tipado que encapsula cualquier fallo de `OllamaProvider` al invocar Ollama real. */
export class OllamaProviderError extends Error {
  constructor(
    readonly reason: OllamaProviderErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OllamaProviderError";
  }
}
