import { randomUUID } from "node:crypto";
import type { AgentTask, ExecutionOptions, ExecutionResult } from "@guerrero-dev/domain";
import type { IExecutionEngine, ILLMProvider, IPolicyEngine } from "@guerrero-dev/application";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import { ContextBuilder } from "./ContextBuilder.js";
import { Planner } from "./Planner.js";
import { ToolSelector } from "./ToolSelector.js";

/**
 * Skeleton (Fase 3.7), endurecido en Fase 5.2/5.3. Punto de entrada
 * previsto para correr un AgentTask de principio a fin: construir
 * contexto → llamar al LLM → planificar → evaluar política → ejecutar.
 * `run()` ya llama de verdad a `ILLMProvider.generate()` con el
 * `BuiltContext` construido (Fase 5.2) — pero esa respuesta todavía no
 * alimenta `Planner`/`IExecutionEngine`, solo queda expuesta en
 * `ExecutionResult.llmResponse`; conectarla al plan real sigue siendo
 * Fase 5.5.
 *
 * `contextBuilder` se recibe por constructor (Fase 5.8), no se instancia
 * aquí — `ContextBuilder` ya requiere `IProjectIntelligenceProvider`, y
 * quien construye ese provider concreto (`infrastructure`) es
 * responsabilidad de quien ensambla este orquestador, no de esta clase.
 * Un fallo de `ILLMProvider.generate()` se propaga sin envolver — mismo
 * criterio "todo o nada" que `TsMorphCodeAnalyzer`/`LiteralCodeSearch`.
 *
 * Fase 5.3: cada `ExecutionPlanStep` con `toolRequest` se evalúa contra
 * `IPolicyEngine.evaluate()` ANTES de ejecutar el plan (mismo orden que
 * documenta `IPolicyEngine`: LLM → Tool Request → Policy Engine →
 * Execution Engine). `ExecutionPlanStep.toolRequest` no trae `id` ni
 * `requestedAt` (ver `ExecutionPlan.ts`) — `run()` los completa aquí al
 * construir el `ToolRequest` real. Ante la primera denegación, `run()`
 * corta y devuelve un `ExecutionResult` con `status: "failed"` y el
 * `reason` de la decisión — no llama a `executionEngine.execute()`. Con
 * `PolicyEvaluator` (única implementación real) fail-closed y sin reglas
 * registradas hoy, toda evaluación deniega por defecto; esto es
 * consistente con el criterio de seguridad del proyecto, no un bug.
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
    const toolSteps = this.toolSelector.selectToolSteps(plan.steps);
    const policyContext = { userId: task.userId, projectRootPath: task.projectRootPath };

    for (const step of toolSteps) {
      if (!step.toolRequest) continue;

      const request = { ...step.toolRequest, id: randomUUID(), requestedAt: new Date() };
      const decision = await this.policyEngine.evaluate(request, policyContext);

      if (!decision.allowed) {
        this.logger.warn(
          { taskId: task.id, planId: plan.id, toolName: request.toolName, reason: decision.reason },
          "AgentOrchestrator: PolicyEngine denegó una ToolRequest, plan no ejecutado",
        );
        return {
          planId: plan.id,
          status: "failed",
          errorMessage: decision.reason,
          finishedAt: new Date(),
          llmResponse,
        };
      }
    }

    this.logger.info(
      { taskId: task.id, planId: plan.id, engine: this.executionEngine.name },
      "AgentOrchestrator: ejecutando plan",
    );

    const result = await this.executionEngine.execute(plan, options);
    return { ...result, llmResponse };
  }
}
