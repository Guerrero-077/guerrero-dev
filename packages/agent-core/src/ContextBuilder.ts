import type { AgentTask } from "@guerrero-dev/domain";

/**
 * Skeleton (Fase 3.7). Construirá el contexto que se le pasa al LLM:
 * mensajes previos de la sesión, memoria relevante (Fase 4), símbolos de
 * proyecto relevantes (Fase 5-6). Por ahora solo define la forma del
 * contrato para que agent-core compile end-to-end.
 */
export interface BuiltContext {
  systemPrompt: string;
  messages: string[];
}

export class ContextBuilder {
  async build(task: AgentTask): Promise<BuiltContext> {
    // TODO(Fase 4+): incorporar memoria semántica y contexto de proyecto.
    return {
      systemPrompt: `Eres el agente de Guerrero Dev trabajando en el proyecto ${task.projectId}.`,
      messages: [task.instruction],
    };
  }
}
