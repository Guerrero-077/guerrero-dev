import type {
  AgentTask,
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
  ToolRequest,
} from "@guerrero-dev/domain";
import type { IExecutionEngine, IPolicyEngine, PolicyContext } from "@guerrero-dev/application";
import type { Event, OpencodeClient } from "@opencode-ai/sdk";
import { OpenCodeExecutionEngineError } from "./OpenCodeExecutionEngineError.js";

/**
 * `IExecutionEngine` real sobre `@opencode-ai/sdk` (Fase 5.5, ver
 * `docs/adr/0003-opencode-primero.md`). `client` se recibe por
 * constructor — quien ensambla este motor decide si apunta a un
 * `opencode serve` local (`createOpencodeServer()`) o remoto; esta
 * clase no gestiona el ciclo de vida del proceso. Se usa el módulo raíz
 * (estable) de `@opencode-ai/sdk`, no `/v2` (más inestable — ver ADR).
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
 * Fase 5.5b: `execute()` corre en paralelo un listener sobre
 * `client.event.subscribe()` que intercepta cada `permission.updated`
 * de esta sesión, lo traduce a un `ToolRequest` real y lo evalúa contra
 * `IPolicyEngine.evaluate()` (Fase 5.3) ANTES de responderle a OpenCode
 * — así se cierra el hueco de seguridad que Fase 5.5 dejó documentado
 * (OpenCode ejecutaba tool calls sin que nuestro PolicyEngine los
 * viera). `plan()` guarda el `PolicyContext` de la task en
 * `policyContextsBySessionId`, indexado por el `session.id` real, para
 * que `execute()` (que no recibe el `AgentTask` completo) pueda
 * reconstruirlo. La respuesta a OpenCode nunca es `"always"` — solo
 * `"once"` (aprobado) o `"reject"` (denegado): `"always"` haría que
 * OpenCode auto-apruebe futuras solicitudes idénticas sin volver a
 * consultar a `IPolicyEngine`, violando su garantía de fail-closed
 * reevaluado por solicitud.
 */
export class OpenCodeExecutionEngine implements IExecutionEngine {
  readonly name = "opencode";

  private readonly policyContextsBySessionId = new Map<string, PolicyContext>();

  constructor(
    private readonly client: OpencodeClient,
    private readonly policyEngine: IPolicyEngine,
  ) {}

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

    this.policyContextsBySessionId.set(response.data.id, {
      userId: task.userId,
      projectRootPath: task.projectRootPath,
    });

    return {
      id: response.data.id,
      taskId: task.id,
      steps: [{ description: task.instruction }],
      createdAt: new Date(),
    };
  }

  async execute(plan: ExecutionPlan, _options: ExecutionOptions): Promise<ExecutionResult> {
    const policyContext = this.policyContextsBySessionId.get(plan.id);
    if (!policyContext) {
      throw new OpenCodeExecutionEngineError(
        "missing_policy_context",
        `OpenCodeExecutionEngine.execute(): no hay PolicyContext para la sesión ${plan.id} — ¿se llamó a plan() primero?`,
      );
    }

    const events = await this.client.event.subscribe({ query: { directory: policyContext.projectRootPath } });

    let listenerError: unknown;
    const listening = this.handlePermissionEvents(events.stream, plan.id, policyContext).catch(
      (error: unknown) => {
        listenerError = error;
      },
    );

    const response = await this.client.session.prompt({
      path: { id: plan.id },
      body: { parts: [{ type: "text", text: plan.steps[0]?.description ?? "" }] },
    });
    await listening;

    if (listenerError) {
      await this.client.session.abort({ path: { id: plan.id } }).catch(() => undefined);
      throw listenerError;
    }

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

  private async handlePermissionEvents(
    stream: AsyncGenerator<Event>,
    sessionId: string,
    policyContext: PolicyContext,
  ): Promise<void> {
    for await (const event of stream) {
      if (event.type !== "permission.updated" || event.properties.sessionID !== sessionId) continue;

      const permission = event.properties;
      const request: ToolRequest = {
        id: permission.id,
        sessionId: permission.sessionID,
        toolName: permission.type,
        input: permission.metadata,
        requestedAt: new Date(permission.time.created),
      };
      const decision = await this.policyEngine.evaluate(request, policyContext);

      await this.client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permission.id },
        body: { response: decision.allowed ? "once" : "reject" },
      });
    }
  }
}

function extractText(parts: readonly { type: string; text?: string }[]): string | undefined {
  const textParts = parts.filter(
    (part): part is { type: string; text: string } => part.type === "text" && part.text !== undefined,
  );
  return textParts.length > 0 ? textParts.map((part) => part.text).join("\n") : undefined;
}
