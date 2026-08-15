import type { AgentTask, ExecutionOptions, ExecutionPlan, ExecutionResult } from "@guerrero-dev/domain";

/**
 * Contrato del motor de ejecución de agentes (Fase 2 §5, Fase 3.8).
 *
 * Cline SDK será el ExecutionEngine primario, OpenCode un adaptador
 * secundario (`@guerrero-dev/execution`). El resto del sistema (Policy
 * Engine, agent-core, API, CLI) programa contra esta interfaz y nunca
 * contra el SDK concreto — el dominio no conoce Cline.
 *
 * Deliberadamente NO se instala `@cline/sdk` todavía (Fase 3): primero
 * este contrato, luego `ClineExecutionEngine implements IExecutionEngine`.
 */
export interface IExecutionEngine {
  readonly name: string;

  plan(task: AgentTask): Promise<ExecutionPlan>;

  execute(plan: ExecutionPlan, options: ExecutionOptions): Promise<ExecutionResult>;
}
