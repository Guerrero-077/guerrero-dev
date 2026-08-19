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
 * `execute()` pasa `model: { providerID, modelID }` en el body de
 * `session.prompt()` (Fase 5.7). `providerId` es fijo por instancia del
 * motor (constructor) — el id bajo el que quien ensambla este motor
 * registró un provider custom en el `Config` que le pasó a
 * `createOpencodeServer()` (p. ej. un provider OpenAI-compatible
 * apuntando a Ollama, ver `apps/cli/src/commands/agent.ts`). Esta clase
 * no sabe ni le importa qué provider es en concreto — solo reenvía el
 * id que recibió. `modelId` viene de `AgentTask.modelName`, guardado
 * por sesión en `plan()`.
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
 *
 * Fix de hang (confirmado empíricamente contra un servidor `opencode
 * serve` real): `client.event.subscribe()` es una suscripción SSE sobre
 * TODOS los eventos del directorio, no solo los de esta sesión, y no se
 * cierra sola cuando la sesión termina — es una conexión abierta
 * indefinidamente. Antes de este fix, `execute()` esperaba (`await
 * listening`) a que ese loop terminara por su cuenta, lo cual nunca
 * pasaba si la sesión terminaba sin disparar ningún `permission.updated`
 * (p. ej. una respuesta de texto simple sin tool calls) — el proceso
 * quedaba colgado indefinidamente aun con la sesión ya resuelta del lado
 * del servidor. Ahora un único `AbortController` gobierna tanto
 * `event.subscribe()` como `session.prompt()` (mismo patrón que
 * `OllamaProvider.fetchWithTimeout`): el `signal` se aborta
 * incondicionalmente en cuanto `session.prompt()` resuelve o rechaza,
 * sin importar si llegó algún `permission.updated`. Un `AbortError`
 * producido por ese cierre intencional se trata como benigno — nunca
 * dispara el camino de "abortar sesión real + propagar sin envolver"
 * reservado a fallos reales de `policyEngine.evaluate()`.
 * `options.timeoutMs` (puerto `IExecutionEngine`, antes ignorado con
 * `_options`) reusa el mismo controller como red de seguridad adicional
 * que acota todo `execute()`, no solo el listener; si no se pasa, no se
 * impone ningún límite nuevo.
 */
interface SessionContext {
  readonly policyContext: PolicyContext;
  readonly modelId: string;
}

export class OpenCodeExecutionEngine implements IExecutionEngine {
  readonly name = "opencode";

  private readonly sessionContextsBySessionId = new Map<string, SessionContext>();

  constructor(
    private readonly client: OpencodeClient,
    private readonly policyEngine: IPolicyEngine,
    private readonly providerId: string,
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

    this.sessionContextsBySessionId.set(response.data.id, {
      policyContext: { userId: task.userId, projectRootPath: task.projectRootPath },
      modelId: task.modelName,
    });

    return {
      id: response.data.id,
      taskId: task.id,
      steps: [{ description: task.instruction }],
      createdAt: new Date(),
    };
  }

  async execute(plan: ExecutionPlan, options: ExecutionOptions): Promise<ExecutionResult> {
    const sessionContext = this.sessionContextsBySessionId.get(plan.id);
    if (!sessionContext) {
      throw new OpenCodeExecutionEngineError(
        "missing_policy_context",
        `OpenCodeExecutionEngine.execute(): no hay contexto de sesión para ${plan.id} — ¿se llamó a plan() primero?`,
      );
    }
    const { policyContext, modelId } = sessionContext;

    const controller = new AbortController();
    let timedOut = false;
    const timeoutHandle =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, options.timeoutMs)
        : undefined;

    try {
      const events = await this.client.event.subscribe({
        query: { directory: policyContext.projectRootPath },
        signal: controller.signal,
      });

      let listenerError: unknown;
      const listening = this.handlePermissionEvents(events.stream, plan.id, policyContext).catch(
        (error: unknown) => {
          // Un AbortError acá es siempre nuestro cierre intencional (abajo),
          // nunca un fallo real de policyEngine.evaluate() ni del stream —
          // según el runtime, cancelar el reader hace que el for-await
          // termine prolijamente o lance AbortError; ambos casos quedan
          // cubiertos acá.
          if (isAbortError(error)) return;
          listenerError = error;
        },
      );

      // `promptSettled` distingue, en el catch de abajo, si el rechazo vino
      // de `session.prompt()` en sí (todavía no se hizo limpieza del
      // listener) o de algo posterior (`listenerError`/`request_failed`,
      // que ya hicieron su propia limpieza y solo hay que re-propagar tal
      // cual). Necesario porque `response` se declara con `const` dentro
      // del `try` — así TypeScript infiere su tipo del `await` real (la
      // sobrecarga correcta según los argumentos), en vez de un
      // `ReturnType<typeof ...>` explícito, que sobre un método
      // sobrecargado resuelve a la última firma y pierde el campo `error`.
      let promptSettled = false;
      try {
        const response = await this.client.session.prompt({
          path: { id: plan.id },
          body: {
            model: { providerID: this.providerId, modelID: modelId },
            parts: [{ type: "text", text: plan.steps[0]?.description ?? "" }],
          },
          signal: controller.signal,
        });
        promptSettled = true;

        // Cierre incondicional del listener apenas prompt() resuelve: esto
        // reemplaza la espera pasiva a que el servidor cierre el stream
        // solo (causa raíz del hang real, ver JSDoc de clase).
        controller.abort();
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
      } catch (error) {
        if (promptSettled) throw error;

        // session.prompt() en sí rechazó (red caída, o timeoutMs venció
        // antes de que respondiera) — todavía no se limpió el listener.
        controller.abort();
        await listening;
        if (timedOut) {
          throw new OpenCodeExecutionEngineError(
            "timeout",
            `OpenCodeExecutionEngine: session.prompt() no respondió dentro de ${options.timeoutMs}ms.`,
            error,
          );
        }
        throw error;
      }
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
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

/**
 * Distingue un abort intencional (cleanup del listener de eventos o
 * `timeoutMs`) de un error real de red/protocolo — mismo criterio que
 * `OllamaProvider.fetchWithTimeout`.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
