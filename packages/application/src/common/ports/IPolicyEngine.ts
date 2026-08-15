import type { PolicyDecision, ToolRequest } from "@guerrero-dev/domain";

/**
 * Policy Engine (Fase 2 §10, Fase 3.7 PolicyEvaluator).
 *
 * Se evalúa toda ToolRequest ANTES de que el ExecutionEngine la ejecute.
 * Esto es intencionalmente independiente del motor de ejecución (Cline,
 * OpenCode, etc.): el día que se cambie de motor, las políticas de
 * seguridad se mantienen.
 *
 *   LLM → Tool Request → Guerrero Policy Engine → Execution Engine
 */
export interface PolicyContext {
  projectRootPath: string;
  userId: string;
}

export interface PolicyRule {
  name: string;
  evaluate(request: ToolRequest, context: PolicyContext): Promise<PolicyDecision> | PolicyDecision;
}

export interface IPolicyEngine {
  addRule(rule: PolicyRule): void;

  evaluate(request: ToolRequest, context: PolicyContext): Promise<PolicyDecision>;
}
