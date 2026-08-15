/**
 * Registro de observabilidad de una ejecución (Fase 3.13). Se crea
 * aunque todavía no haya un LLM real conectado, para no tener que rediseñar
 * el modelo de datos más adelante.
 */
export type AgentRunStatus = "running" | "succeeded" | "failed";

export interface AgentRun {
  id: string;
  sessionId: string;
  taskId: string;
  status: AgentRunStatus;
  modelName: string;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  toolsUsed: string[];
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  result?: string;
}
