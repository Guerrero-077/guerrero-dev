import type { AgentTask, ExecutionOptions, ExecutionPlan, ExecutionResult } from "@guerrero-dev/domain";
import type { IExecutionEngine } from "@guerrero-dev/application";

/**
 * Implementación de `IExecutionEngine` que no ejecuta nada — útil para
 * cablear `AgentService` y probar la API/CLI de punta a punta en Fase 3,
 * sin depender todavía de Cline ni de OpenCode.
 */
export class NoopExecutionEngine implements IExecutionEngine {
  readonly name = "noop";

  async plan(task: AgentTask): Promise<ExecutionPlan> {
    return {
      id: `plan-${task.id}`,
      taskId: task.id,
      steps: [{ description: "NoopExecutionEngine: sin motor de ejecución real configurado todavía." }],
      createdAt: new Date(),
    };
  }

  async execute(plan: ExecutionPlan, _options: ExecutionOptions): Promise<ExecutionResult> {
    return {
      planId: plan.id,
      status: "failed",
      errorMessage:
        "No hay un ExecutionEngine real configurado. Esto llega en Fase 7 con ClineExecutionEngine u OpenCodeExecutionEngine.",
      finishedAt: new Date(),
    };
  }
}
