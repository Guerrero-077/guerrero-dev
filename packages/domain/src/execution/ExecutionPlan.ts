import type { ToolRequest } from "./ToolRequest.js";

/**
 * Plan producido por `IExecutionEngine.plan()` (Fase 3.8) a partir de un
 * AgentTask: los pasos/herramientas que el motor propone ejecutar, antes
 * de que el Policy Engine los apruebe y `execute()` los corra realmente.
 */
export interface ExecutionPlanStep {
  description: string;
  toolRequest?: Omit<ToolRequest, "id" | "requestedAt">;
}

export interface ExecutionPlan {
  id: string;
  taskId: string;
  steps: ExecutionPlanStep[];
  createdAt: Date;
}
