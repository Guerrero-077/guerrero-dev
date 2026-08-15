/**
 * Entrada del ModelRegistry (Fase 2 §6). Describe un modelo LLM disponible
 * (local vía Ollama o cloud) y sus requisitos/capacidades, para que el
 * sistema pueda elegir el mejor modelo disponible dada una tarea y el
 * hardware actual.
 */
export type ModelProviderKind = "ollama" | "anthropic" | "openai" | "other";

export interface ModelDescriptor {
  name: string;
  provider: ModelProviderKind;
  contextWindow: number;
  toolCalling: boolean;
  codingScore?: number;
  reasoningScore?: number;
  vramRequirementMb?: number;
  ramRequirementMb?: number;
  costPerMillionInputTokens?: number;
  costPerMillionOutputTokens?: number;
}

export interface TaskModelRequirements {
  minContextWindow?: number;
  requiresToolCalling?: boolean;
  minCodingScore?: number;
  minReasoningScore?: number;
  preferLocal?: boolean;
}
