import type { ModelDescriptor } from "@guerrero-dev/domain";
import type { ILLMProvider } from "@guerrero-dev/application";
import { OllamaProviderError } from "./OllamaProviderError.js";

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    details?: { parameter_size?: string; quantization_level?: string };
    size?: number;
  }>;
}

interface OllamaGenerateResponse {
  response: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * `ILLMProvider` sobre Ollama (Fase 2 §10-11, Fase 3.6, endurecido en
 * Fase 5.1). Cliente HTTP mínimo — sin streaming ni tool-calling
 * todavía, eso llega cuando agent-core/execution estén implementados
 * (Fase 5.5+). Mismo criterio de timeout/errores tipados que
 * `OllamaEmbeddingProvider` (embeddings) y el resto de adapters de
 * `infrastructure/` (`GitTrackedFilesSourceError`, `FileReaderError`).
 */
export class OllamaProvider implements ILLMProvider {
  readonly kind = "ollama";

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async listAvailableModels(): Promise<ModelDescriptor[]> {
    const res = await this.fetchWithTimeout("/api/tags", { method: "GET" }, "listar modelos");
    const data = await this.parseJson<OllamaTagsResponse>(res, "listar modelos");

    if (!Array.isArray(data.models)) {
      throw new OllamaProviderError(
        "invalid_response",
        "Ollama devolvió una respuesta sin 'models' al listar modelos",
      );
    }

    return data.models.map((m): ModelDescriptor => ({
      name: m.name,
      provider: "ollama" as const,
      contextWindow: 0, // Ollama no expone esto en /api/tags; se completa en el ModelRegistry (Fase 2 §14).
      toolCalling: false,
      ...(m.size ? { ramRequirementMb: Math.round(m.size / (1024 * 1024)) } : {}),
    }));
  }

  async generate(input: { modelName: string; prompt: string; system?: string }): Promise<string> {
    const res = await this.fetchWithTimeout(
      "/api/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.modelName,
          prompt: input.prompt,
          system: input.system,
          stream: false,
        }),
      },
      "generar",
    );
    const data = await this.parseJson<OllamaGenerateResponse>(res, "generar");

    if (typeof data.response !== "string") {
      throw new OllamaProviderError(
        "invalid_response",
        "Ollama devolvió una respuesta sin 'response' al generar",
      );
    }

    return data.response;
  }

  private async fetchWithTimeout(path: string, init: RequestInit, action: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new OllamaProviderError(
          "timeout",
          `Ollama no respondió dentro de ${this.timeoutMs}ms al ${action}`,
          err,
        );
      }
      throw new OllamaProviderError(
        "unreachable",
        `No se pudo conectar a Ollama (${this.baseUrl}) al ${action}`,
        err,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new OllamaProviderError("http_error", `Ollama respondió ${res.status} al ${action}`);
    }

    return res;
  }

  private async parseJson<T>(res: Response, action: string): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new OllamaProviderError(
        "invalid_response",
        `Ollama devolvió una respuesta no-JSON al ${action}`,
        err,
      );
    }
  }
}
