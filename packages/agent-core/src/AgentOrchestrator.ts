import { randomUUID } from "node:crypto";
import type { AgentTask, ExecutionOptions, ExecutionResult } from "@guerrero-dev/domain";
import type { IExecutionEngine, IPolicyEngine } from "@guerrero-dev/application";
import type { ILogger } from "@guerrero-dev/shared";
import { noopLogger } from "@guerrero-dev/shared";
import { ContextBuilder } from "./ContextBuilder.js";
import { Planner } from "./Planner.js";
import { ToolSelector } from "./ToolSelector.js";

/**
 * Skeleton (Fase 3.7), endurecido en Fase 5.2/5.3 y cerrado en Fase 5.14.
 * Corre un AgentTask de principio a fin: construir contexto → planificar →
 * evaluar política → ejecutar, con el contexto real viajando hasta el motor.
 *
 * Fase 5.14 — el gap que cierra esta clase: entre 5.2 y 5.13, `run()`
 * construía el `BuiltContext` real (`ContextBuilder`: Memory + Project
 * Intelligence contra Postgres) y lo gastaba en una llamada standalone a
 * `ILLMProvider.generate()` cuyo resultado no alimentaba nada — quedaba
 * pegado en `ExecutionResult.llmResponse`, que ningún consumidor real leía
 * (verificado repo-wide antes de borrarlo). El plan que OpenCode ejecutaba
 * de verdad nunca veía ese contexto: `session.prompt()` salía con el
 * `task.instruction` pelado. Eran dos inferencias por task, una de ellas
 * descartada. Ahora el contexto viaja por `ExecutionOptions.systemPrompt`
 * hasta `OpenCodeExecutionEngine.execute()`, que lo manda como `body.system`
 * de `session.prompt()` — campo real del binario `opencode serve`,
 * verificado en su `GET /doc` en vivo y coincidente con
 * `SessionPromptData.body.system` de `@opencode-ai/sdk` (a diferencia de los
 * eventos de permiso de Fase 5.9d, acá el paquete npm y el binario NO están
 * desincronizados).
 *
 * Por eso `ILLMProvider` deja de ser dependencia de esta clase: el LLM que
 * corre la task es el que invoca OpenCode con el provider que le configuró
 * el composition root (`Config.provider`, ver `apps/cli/src/commands/agent.ts`),
 * no un segundo modelo llamado en paralelo desde acá. `ILLMProvider` y
 * `OllamaProvider` siguen existiendo como puerto + adapter real con sus
 * tests — simplemente no tienen consumidor en el camino de `agent run`
 * hasta que haga falta una inferencia propia (p. ej. resumir contexto antes
 * de mandarlo, o un Planner real que decida pasos por su cuenta).
 *
 * `context.messages` sigue sin consumirse acá, y no es un olvido: hoy es
 * exactamente `[task.instruction]`, el mismo texto que
 * `OpenCodeExecutionEngine.plan()` ya pone en `steps[0].description` y que
 * `execute()` manda como única parte del prompt. Reenviarlo duplicaría el
 * mensaje. Cuando `BuiltContext.messages` traiga historial real (turnos
 * previos de una `AgentSession` persistida, que todavía no existe), ahí sí
 * hará falta un canal propio.
 *
 * El orden importa: `contextBuilder.build()` corre ANTES de
 * `planner.plan()`. Construir el contexto toca Postgres y Ollama
 * (embeddings) y puede fallar; hacerlo primero significa que un fallo ahí
 * no deja una sesión de OpenCode creada y colgando — es el comportamiento
 * que ya se observó en la verificación real de Fase 5.6 y se conserva a
 * propósito. Un fallo de `ContextBuilder.build()` se propaga sin envolver
 * — mismo criterio "todo o nada" que `TsMorphCodeAnalyzer`/`LiteralCodeSearch`.
 *
 * `contextBuilder` se recibe por constructor (Fase 5.8), no se instancia
 * aquí — `ContextBuilder` ya requiere `IProjectIntelligenceProvider`, y
 * quien construye ese provider concreto (`infrastructure`) es
 * responsabilidad de quien ensambla este orquestador, no de esta clase.
 *
 * Fase 5.3: cada `ExecutionPlanStep` con `toolRequest` se evalúa contra
 * `IPolicyEngine.evaluate()` ANTES de ejecutar el plan (mismo orden que
 * documenta `IPolicyEngine`: LLM → Tool Request → Policy Engine →
 * Execution Engine). `ExecutionPlanStep.toolRequest` no trae `id` ni
 * `requestedAt` (ver `ExecutionPlan.ts`) — `run()` los completa aquí al
 * construir el `ToolRequest` real. Ante la primera denegación, `run()`
 * corta y devuelve un `ExecutionResult` con `status: "failed"` y el
 * `reason` de la decisión — no llama a `executionEngine.execute()`. Con el
 * motor OpenCode este bucle está muerto en la práctica (sus planes no
 * llevan `toolRequest`, así que `ToolSelector.selectToolSteps()` filtra a
 * `[]`; la política real se aplica en
 * `OpenCodeExecutionEngine.handlePermissionEvents()`, Fase 5.5b/5.9d/5.11)
 * — se conserva porque es el contrato del puerto, no del motor de turno.
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
    const context = await this.contextBuilder.build(task);

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
        };
      }
    }

    this.logger.info(
      { taskId: task.id, planId: plan.id, engine: this.executionEngine.name },
      "AgentOrchestrator: ejecutando plan con el contexto real como system prompt",
    );

    // El systemPrompt del contexto pisa deliberadamente cualquier
    // `options.systemPrompt` que traiga el caller: construirlo es la razón de
    // ser de este orquestador. Quien quiera otro contexto inyecta otro
    // ContextBuilder, no cuela un prompt por la puerta de atrás.
    return this.executionEngine.execute(plan, { ...options, systemPrompt: context.systemPrompt });
  }
}
