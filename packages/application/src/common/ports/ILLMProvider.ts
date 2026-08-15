import type { ModelDescriptor } from "@guerrero-dev/domain";

/**
 * Contrato para proveedores de modelos LLM (Fase 2 §6). `OllamaProvider`
 * (`infrastructure/llm`) es la primera implementación; proveedores cloud
 * (Anthropic, OpenAI) se agregan detrás de la misma interfaz vía LLM
 * Gateway.
 */
export interface ILLMProvider {
  readonly kind: string;

  listAvailableModels(): Promise<ModelDescriptor[]>;

  generate(input: { modelName: string; prompt: string; system?: string }): Promise<string>;
}
