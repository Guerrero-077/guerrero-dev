/** Opciones que controlan cómo `IExecutionEngine.execute()` corre un ExecutionPlan. */
export interface ExecutionOptions {
  /** Si es `false`, cada ToolRequest de riesgo medio/alto espera aprobación explícita antes de ejecutarse. */
  autoApprove?: boolean;
  timeoutMs?: number;
}
