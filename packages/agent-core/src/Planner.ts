import type { AgentTask, ExecutionPlan } from "@guerrero-dev/domain";
import type { IExecutionEngine } from "@guerrero-dev/application";

/**
 * Skeleton (Fase 3.7). Hoy delega directamente en
 * `IExecutionEngine.plan()`; en Fase 7, cuando haya un LLM real
 * conectado, decidirá aquí si el plan necesita descomponerse en pasos
 * adicionales antes de ejecutarse.
 */
export class Planner {
  constructor(private readonly executionEngine: IExecutionEngine) {}

  async plan(task: AgentTask): Promise<ExecutionPlan> {
    return this.executionEngine.plan(task);
  }
}
