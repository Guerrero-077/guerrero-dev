export type ExecutionResultStatus = "succeeded" | "failed" | "cancelled";

/** Resultado producido por `IExecutionEngine.execute()`. */
export interface ExecutionResult {
  planId: string;
  status: ExecutionResultStatus;
  output?: string;
  errorMessage?: string;
  finishedAt: Date;
}
