import type { AgentTask, ExecutionOptions, ExecutionResult } from "@guerrero-dev/domain";
import type { IExecutionEngine, ILLMProvider, IPolicyEngine } from "@guerrero-dev/application";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import { ContextBuilder } from "./ContextBuilder.js";
import { Planner } from "./Planner.js";
import { ToolSelector } from "./ToolSelector.js";

/**
 * Skeleton (Fase 3.7), endurecido en Fase 5.2. Punto de entrada previsto
 * para correr un AgentTask de principio a fin: construir contexto →
 * llamar al LLM → planificar → evaluar política → ejecutar. `run()` ya
 * llama de verdad a `ILLMProvider.generate()` con el `BuiltContext`
 * construido (Fase 5.2) — pero esa respuesta todavía no alimenta
 * `Planner`/`IExecutionEngine`, solo queda expuesta en
 * `ExecutionResult.llmResponse`; conectarla al plan real y evaluar
 * `PolicyEngine` por paso sigue siendo Fase 5.3/5.5.
 *
 * `contextBuilder` se recibe por constructor (Fase 5.8), no se instancia
 * aquí — `ContextBuilder` ya requiere `IProjectIntelligenceProvider`, y
 * quien construye ese provider concreto (`infrastructure`) es
 * responsabilidad de quien ensambla este orquestador, no de esta clase.
 * Un fallo de `ILLMProvider.generate()` se propaga sin envolver — mismo
 * criterio "todo o nada" que `TsMorphCodeAnalyzer`/`LiteralCodeSearch`.
 */
export class AgentOrchestrator {
  private readonly toolSelector = new ToolSelector();
  private readonly planner: Planner;

  constructor(
    private readonly executionEngine: IExecutionEngine,
    private readonly policyEngine: IPolicyEngine,
    private readonly contextBuilder: ContextBuilder,
    private readonly llmProvider: ILLMProvider,
    private readonly logger: ILogger = noopLogger,
  ) {
    this.planner = new Planner(executionEngine);
  }

  async run(task: AgentTask, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const context = await this.contextBuilder.build(task);

    const llmResponse = await this.llmProvider.generate({
      modelName: task.modelName,
      prompt: context.messages.join("\n"),
      system: context.systemPrompt,
    });

    const plan = await this.planner.plan(task);
    this.toolSelector.selectToolSteps(plan.steps);

    this.logger.info(
      { taskId: task.id, planId: plan.id, engine: this.executionEngine.name },
      "AgentOrchestrator: ejecutando plan (sin PolicyEngine por-paso todavía, ver Fase 5.3)",
    );

    const result = await this.executionEngine.execute(plan, options);
    return { ...result, llmResponse };
  }
}
