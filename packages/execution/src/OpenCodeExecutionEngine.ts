import type { AgentTask, ExecutionOptions, ExecutionPlan, ExecutionResult } from "@guerrero-dev/domain";
import type { IExecutionEngine } from "@guerrero-dev/application";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { OpenCodeExecutionEngineError } from "./OpenCodeExecutionEngineError.js";

/**
 * `IExecutionEngine` real sobre `@opencode-ai/sdk` (Fase 5.5, ver
 * `docs/adr/0003-opencode-primero.md`). `client` se recibe por
 * constructor — quien ensambla este motor decide si apunta a un
 * `opencode serve` local (`createOpencodeServer()`) o remoto; esta
 * clase no gestiona el ciclo de vida del proceso.
 *
 * `plan()` crea una sesión real de OpenCode (`session.create`, todavía
 * sin invocar ningún LLM) y usa su `id` real como `ExecutionPlan.id` —
 * así `execute()` sabe a qué sesión dirigirse. `execute()` envía
 * `plan.steps[0].description` como único mensaje de la sesión
 * (`session.prompt`) y mapea el resultado: `AssistantMessage.error`
 * presente → `ExecutionResult.status: "failed"`; ausente → `"succeeded"`,
 * con `output` armado a partir de las partes de tipo texto de la
 * respuesta.
 *
 * Una respuesta con `error` a nivel de transporte/protocolo (p. ej. 400
 * Bad Request de la propia API HTTP, distinto del `AssistantMessage.error`
 * semántico) lanza `OpenCodeExecutionEngineError` — no se silencia en un
 * `ExecutionResult` normal. Un rechazo de la promesa del cliente (red
 * caída, servidor no arrancó) se propaga sin envolver, mismo criterio
 * "todo o nada" que el resto del repo.
 *
 * `execute()` no pasa `model` en el body de `session.prompt()` — deja
 * que OpenCode use su provider configurado por defecto.
 * `AgentTask.modelName` no tiene hoy una convención `providerID:modelID`
 * (la que exige el SDK) — no se inventa una sin evidencia de qué
 * providers va a soportar OpenCode aquí.
 *
 * Brecha conocida y documentada (Fase 5.5b, no resuelta aquí): OpenCode
 * ejecuta tool calls de forma autónoma dentro de `session.prompt()` —
 * `IPolicyEngine.evaluate()` (Fase 5.3) no se invoca por cada una,
 * porque este motor no puebla `ExecutionPlanStep.toolRequest` (no hay
 * visibilidad previa de qué herramienta se va a llamar). Puentear los
 * eventos de permiso reales de OpenCode hacia `IPolicyEngine` queda
 * para un subpaso posterior.
 */
export class OpenCodeExecutionEngine implements IExecutionEngine {
  readonly name = "opencode";

  constructor(private readonly client: OpencodeClient) {}

  async plan(task: AgentTask): Promise<ExecutionPlan> {
    const response = await this.client.session.create({
      query: { directory: task.projectRootPath },
    });

    if (response.error !== undefined) {
      throw new OpenCodeExecutionEngineError(
        "request_failed",
        "OpenCodeExecutionEngine: session.create() devolvió un error de transporte.",
        response.error,
      );
    }

    return {
      id: response.data.id,
      taskId: task.id,
      steps: [{ description: task.instruction }],
      createdAt: new Date(),
    };
  }

  async execute(plan: ExecutionPlan, _options: ExecutionOptions): Promise<ExecutionResult> {
    const response = await this.client.session.prompt({
      path: { id: plan.id },
      body: { parts: [{ type: "text", text: plan.steps[0]?.description ?? "" }] },
    });

    if (response.error !== undefined) {
      throw new OpenCodeExecutionEngineError(
        "request_failed",
        "OpenCodeExecutionEngine: session.prompt() devolvió un error de transporte.",
        response.error,
      );
    }

    const { info, parts } = response.data;
    const output = extractText(parts);

    return {
      planId: plan.id,
      status: info.error ? "failed" : "succeeded",
      ...(info.error ? { errorMessage: JSON.stringify(info.error) } : {}),
      ...(output !== undefined ? { output } : {}),
      finishedAt: new Date(),
    };
  }
}

function extractText(parts: readonly { type: string; text?: string }[]): string | undefined {
  const textParts = parts.filter(
    (part): part is { type: string; text: string } => part.type === "text" && part.text !== undefined,
  );
  return textParts.length > 0 ? textParts.map((part) => part.text).join("\n") : undefined;
}
