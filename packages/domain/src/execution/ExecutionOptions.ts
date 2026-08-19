/** Opciones que controlan cómo `IExecutionEngine.execute()` corre un ExecutionPlan. */
export interface ExecutionOptions {
  /** Si es `false`, cada ToolRequest de riesgo medio/alto espera aprobación explícita antes de ejecutarse. */
  autoApprove?: boolean;
  timeoutMs?: number;
  /**
   * System prompt ya construido para este plan (Fase 5.14): el
   * `BuiltContext.systemPrompt` de `ContextBuilder` (Memory + Project
   * Intelligence reales). Es contenido, no un knob de ejecución como los dos
   * campos de arriba — vive acá porque `execute(plan, options)` es el único
   * canal por-request disponible: el `ExecutionPlan` lo produce el propio
   * motor en `plan()` (su `id` es el `session.id` real de OpenCode), así que
   * el orquestador no puede inyectarlo ahí sin fabricar estado de dominio
   * que no le pertenece. `OpenCodeExecutionEngine` lo traduce a `body.system`
   * de `session.prompt()`; si no viene, prompea sin system prompt — el body
   * queda idéntico al de antes de esta fase.
   */
  systemPrompt?: string;
}
