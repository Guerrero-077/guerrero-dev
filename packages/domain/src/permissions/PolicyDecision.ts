export type RiskLevel = "low" | "medium" | "high";

/** Decisión del Policy Engine sobre una ToolRequest (Fase 2 §10, Fase 3.7 PolicyEvaluator). */
export interface PolicyDecision {
  toolRequestId: string;
  allowed: boolean;
  riskLevel: RiskLevel;
  reason: string;
  decidedAt: Date;
}
