/**
 * La unidad de trabajo que se le pide a un ExecutionEngine. Es la entrada
 * de `IExecutionEngine.plan()` (Fase 3.8).
 *
 * `userId`/`projectRootPath` (Fase 5.3) existen para construir el
 * `PolicyContext` que `AgentOrchestrator.run()` pasa a
 * `IPolicyEngine.evaluate()` por cada `ToolRequest` del plan — no se usan
 * en ningún otro punto del flujo todavía.
 */
export interface AgentTask {
  id: string;
  sessionId: string;
  projectId: string;
  userId: string;
  projectRootPath: string;
  instruction: string;
  modelName: string;
}
