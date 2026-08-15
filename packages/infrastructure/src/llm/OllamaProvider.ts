import type { ModelDescriptor } from "@guerrero-dev/domain";
import type { ILLMProvider } from "@guerrero-dev/application";

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

/**
 * `ILLMProvider` sobre Ollama (Fase 2 §10-11, Fase 3.6). Cliente HTTP
 * mínimo — sin streaming ni tool-calling todavía, eso llega cuando
 * agent-core/execution estén implementados (Fase 7).
 */
export class OllamaProvider implements ILLMProvider {
  readonly kind = "ollama";

  constructor(private readonly baseUrl: string) {}

  async listAvailableModels(): Promise<ModelDescriptor[]> {
    const res = await fetch(new URL("/api/tags", this.baseUrl));
    if (!res.ok) {
      throw new Error(`Ollama respondió ${res.status} al listar modelos`);
    }

    const data = (await res.json()) as OllamaTagsResponse;
    return data.models.map((m): ModelDescriptor => ({
      name: m.name,
      provider: "ollama" as const,
      contextWindow: 0, // Ollama no expone esto en /api/tags; se completa en el ModelRegistry (Fase 2 §14).
      toolCalling: false,
      ...(m.size ? { ramRequirementMb: Math.round(m.size / (1024 * 1024)) } : {}),
    }));
  }

  async generate(input: { modelName: string; prompt: string; system?: string }): Promise<string> {
    const res = await fetch(new URL("/api/generate", this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.modelName,
        prompt: input.prompt,
        system: input.system,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama respondió ${res.status} al generar`);
    }

    const data = (await res.json()) as OllamaGenerateResponse;
    return data.response;
  }
}
