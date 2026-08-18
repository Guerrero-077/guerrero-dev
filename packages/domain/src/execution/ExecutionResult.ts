export type ExecutionResultStatus = "succeeded" | "failed" | "cancelled";

/** Resultado producido por `IExecutionEngine.execute()`. */
export interface ExecutionResult {
  planId: string;
  status: ExecutionResultStatus;
  output?: string;
  errorMessage?: string;
  finishedAt: Date;
  /** Respuesta cruda del LLM para este AgentTask (Fase 5.2) — todavía no alimenta plan/execute, ver Fase 5.5. */
  llmResponse?: string;
}
