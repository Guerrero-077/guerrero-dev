import type { AgentTask, ExecutionOptions, ExecutionResult } from "@guerrero-dev/domain";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import type { IExecutionEngine } from "../common/ports/IExecutionEngine.js";

/**
 * Caso de uso de agente: recibe un AgentTask, pide un plan al
 * IExecutionEngine configurado y lo ejecuta. Fase 3: sin PolicyEngine ni
 * agent-core conectados todavía — eso llega en Fase 7 cuando exista un
 * ExecutionEngine real (Cline/OpenCode).
 */
export class AgentService {
  constructor(
    private readonly executionEngine: IExecutionEngine,
    private readonly logger: ILogger = noopLogger,
  ) {}

  async runTask(task: AgentTask, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    this.logger.info({ taskId: task.id, engine: this.executionEngine.name }, "Planificando tarea");
    const plan = await this.executionEngine.plan(task);

    this.logger.info({ taskId: task.id, planId: plan.id }, "Ejecutando plan");
    return this.executionEngine.execute(plan, options);
  }
}
