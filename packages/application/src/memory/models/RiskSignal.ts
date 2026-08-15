/**
 * Severidad de un `RiskSignal` (Fase 4.8) — deliberadamente separada de
 * `MemoryEvaluation.confidence`/`importance`: una decisión arquitectónica
 * puede ser importantísima y no peligrosa; un cambio de seguridad puede
 * tener importancia de memoria baja pero requerir revisión humana
 * inmediata. `importance` y `risk` son dimensiones independientes.
 */
export type RiskSeverity = "low" | "medium" | "high";

/**
 * Evidencia de riesgo detectada en un commit (Fase 4.8), no un booleano.
 * El caso que motivó este tipo: `docs/benchmarks/candidate-detection/gescomph-api/92475e3.json`
 * — un bypass de validación CSRF que el mensaje del commit no menciona en
 * absoluto, solo visible leyendo el diff completo.
 *
 * `type` es `string`, no un union, a propósito — la taxonomía de tipos de
 * riesgo (`security_change` es el único confirmado por evidencia hasta
 * ahora) todavía no está madura. Se convierte en union cuando el golden
 * dataset tenga suficientes casos de cada tipo.
 */
export interface RiskSignal {
  readonly type: string;
  readonly severity: RiskSeverity;
  readonly reason: string;
}
