/**
 * @guerrero-dev/execution
 *
 * Implementaciones de `IExecutionEngine`. `NoopExecutionEngine` (Fase
 * 3.8) sigue disponible para cablear AgentService/API/CLI sin autonomía
 * real. `OpenCodeExecutionEngine` (Fase 5.5, ver
 * `docs/adr/0003-opencode-primero.md`) es el primer motor real, sobre
 * `@opencode-ai/sdk`. `@cline/sdk` sigue sin instalarse — diferido sin
 * fecha, ver ADR 0003.
 */
export * from "./NoopExecutionEngine.js";
export * from "./OpenCodeExecutionEngine.js";
export * from "./OpenCodeExecutionEngineError.js";
