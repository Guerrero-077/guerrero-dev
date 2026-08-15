/**
 * La unidad de trabajo que se le pide a un ExecutionEngine. Es la entrada
 * de `IExecutionEngine.plan()` (Fase 3.8).
 */
export interface AgentTask {
  id: string;
  sessionId: string;
  projectId: string;
  instruction: string;
  modelName: string;
}
