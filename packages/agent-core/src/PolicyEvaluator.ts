import type { PolicyDecision, ToolRequest } from "@guerrero-dev/domain";
import type { IPolicyEngine, PolicyContext, PolicyRule } from "@guerrero-dev/application";

/**
 * Implementación de referencia de `IPolicyEngine` (Fase 2 §10, Fase 3.7).
 * Es la única pieza de agent-core con lógica real en esta fase, porque la
 * seguridad no puede esperar a Fase 7: por defecto deniega todo lo que no
 * tenga una regla explícita que lo apruebe.
 */
export class PolicyEvaluator implements IPolicyEngine {
  private readonly rules: PolicyRule[] = [];

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  async evaluate(request: ToolRequest, context: PolicyContext): Promise<PolicyDecision> {
    for (const rule of this.rules) {
      const decision = await rule.evaluate(request, context);
      if (!decision.allowed) {
        return decision;
      }
    }

    if (this.rules.length === 0) {
      return {
        toolRequestId: request.id,
        allowed: false,
        riskLevel: "high",
        reason: "Sin reglas configuradas: denegado por defecto (fail-closed).",
        decidedAt: new Date(),
      };
    }

    return {
      toolRequestId: request.id,
      allowed: true,
      riskLevel: "low",
      reason: "Todas las reglas configuradas aprobaron la solicitud.",
      decidedAt: new Date(),
    };
  }
}
