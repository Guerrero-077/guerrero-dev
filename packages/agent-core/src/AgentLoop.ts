import type { AgentTask, ExecutionResult } from "@guerrero-dev/domain";
import { AgentOrchestrator } from "./AgentOrchestrator.js";

/**
 * Skeleton (Fase 3.7). El loop de conversación multi-turno
 * (mensaje → plan → ejecución → observación → siguiente mensaje) es
 * autonomía real y queda explícitamente fuera de Fase 3. Por ahora corre
 * un único AgentTask con el AgentOrchestrator y termina.
 */
export class AgentLoop {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  async runOnce(task: AgentTask): Promise<ExecutionResult> {
    return this.orchestrator.run(task);
  }
}
