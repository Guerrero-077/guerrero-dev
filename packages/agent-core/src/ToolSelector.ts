import type { ExecutionPlanStep } from "@guerrero-dev/domain";

/**
 * Skeleton (Fase 3.7). Cuando exista un catálogo real de herramientas MCP
 * (`@guerrero-dev/mcp`, Fase 7), decidirá cuál usar para cada paso de un
 * ExecutionPlan. Hoy solo filtra los pasos que ya traen un ToolRequest.
 */
export class ToolSelector {
  selectToolSteps(steps: ExecutionPlanStep[]): ExecutionPlanStep[] {
    return steps.filter((step) => step.toolRequest !== undefined);
  }
}
