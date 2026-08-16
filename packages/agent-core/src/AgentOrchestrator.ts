import type { AgentTask, ExecutionOptions, ExecutionResult } from "@guerrero-dev/domain";
import type { IExecutionEngine, IPolicyEngine } from "@guerrero-dev/application";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import { ContextBuilder } from "./ContextBuilder.js";
import { Planner } from "./Planner.js";
import { ToolSelector } from "./ToolSelector.js";

/**
 * Skeleton (Fase 3.7). Punto de entrada previsto para correr un AgentTask
 * de principio a fin: construir contexto → planificar → evaluar política →
 * ejecutar. Hoy compone las piezas pero sin loop de conversación real
 * (`AgentLoop`) ni LLM conectado — eso es Fase 7.
 *
 * `contextBuilder` se recibe por constructor (Fase 5.8), no se instancia
 * aquí — `ContextBuilder` ya requiere `IProjectIntelligenceProvider`, y
 * quien construye ese provider concreto (`infrastructure`) es
 * responsabilidad de quien ensambla este orquestador, no de esta clase.
 * `run()` sigue descartando el `BuiltContext` deliberadamente: conectarlo
 * con `Planner`/la ejecución real sigue siendo Fase 7, fuera de 5.8.
 */
export class AgentOrchestrator {
  private readonly toolSelector = new ToolSelector();
  private readonly planner: Planner;

  constructor(
    private readonly executionEngine: IExecutionEngine,
    private readonly policyEngine: IPolicyEngine,
    private readonly contextBuilder: ContextBuilder,
    private readonly logger: ILogger = noopLogger,
  ) {
    this.planner = new Planner(executionEngine);
  }

  async run(task: AgentTask, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    await this.contextBuilder.build(task);

    const plan = await this.planner.plan(task);
    this.toolSelector.selectToolSteps(plan.steps);

    this.logger.info(
      { taskId: task.id, planId: plan.id, engine: this.executionEngine.name },
      "AgentOrchestrator: ejecutando plan (sin PolicyEngine por-paso todavía, ver Fase 7)",
    );

    return this.executionEngine.execute(plan, options);
  }
}
