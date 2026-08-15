/**
 * @guerrero-dev/execution
 *
 * Implementaciones de `IExecutionEngine` (Fase 3.8). Solo existe
 * `NoopExecutionEngine` por ahora, para poder cablear AgentService/API/CLI
 * de punta a punta sin autonomía real.
 *
 * Deliberadamente NO se instala `@cline/sdk` ni el SDK de OpenCode en esta
 * fase (ver docs/fase-3-foundation.md): primero se valida el contrato
 * `IExecutionEngine`, y solo después:
 *
 *   ClineExecutionEngine implements IExecutionEngine     (Fase 7)
 *   OpenCodeExecutionEngine implements IExecutionEngine  (Fase 7)
 */
export * from "./NoopExecutionEngine.js";
