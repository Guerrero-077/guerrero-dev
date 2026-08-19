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
 * Fase 5.14: `execute()` reenvía `options.systemPrompt` como `body.system`
 * de `session.prompt()` cuando viene. Es el canal por el que el contexto
 * real de `ContextBuilder` (Memory + Project Intelligence, armado en
 * `AgentOrchestrator.run()`) llega por fin al LLM que corre la task —
 * antes se construía y se tiraba, y el prompt salía con el
 * `task.instruction` pelado. `system` es un campo real del binario:
 * verificado en el `GET /doc` en vivo de `opencode serve` y coincidente
 * con `SessionPromptData.body.system` de
 * `@opencode-ai/sdk/dist/gen/types.gen.d.ts` — acá, a diferencia de los
 * eventos de permiso de Fase 5.9d, el paquete npm y el binario SÍ
 * coinciden. Se descartaron dos alternativas: `Config.agent.build.prompt`
 * (es a nivel servidor entero, no por-request, y su semántica ni siquiera
 * está documentada en el spec) y meter el contexto como una parte de texto
 * extra en `parts` (lo mezclaría con la instrucción del usuario, que es
 * justamente lo que un system prompt separa). Sin `options.systemPrompt`,
 * el body sale idéntico al de antes de esta fase — sin la clave, no con
 * la clave en `undefined`.
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
 * reevaluado por solicitud. **Corrección (Fase 5.9d)**: este puente
 * quedó escrito contra el tipo de evento equivocado desde el día uno —
 * nunca interceptó un permiso real hasta que se arregló en 5.9d, ver ese
 * párrafo más abajo.
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
 *
 * Fase 5.9d: causa raíz real del deadlock que `EXECUTION_TIMEOUT_MS`
 * (`apps/cli/src/commands/agent.ts`) solo mitigaba. Confirmado en vivo
 * (dos suscripciones SSE paralelas a un `opencode serve` real con la
 * config real de este engine — una con `directory` igual a este código,
 * otra sin filtro — disparando el mismo permiso real: NINGUNA de las dos
 * recibió jamás un `permission.updated`) e inspeccionando `GET /doc`
 * (spec OpenAPI que sirve el propio binario en vivo): el servidor real
 * de `opencode-ai@1.18.18` emite `"permission.asked"`
 * (`properties: {id, sessionID, permission, patterns, metadata, always,
 * tool}`) — nunca `"permission.updated"`. Los tipos de
 * `@opencode-ai/sdk@1.18.18` (`Event`/`EventPermissionUpdated`/
 * `Permission`, mismo número de versión que el binario) están
 * desincronizados del binario real: declaran una forma
 * (`properties.type`, `properties.time.created`) que el servidor real
 * jamás produjo. El filtro anterior de `handlePermissionEvents()`
 * (`event.type !== "permission.updated"`) nunca coincidía con nada real
 * — ningún permiso pedido de verdad llegó jamás a
 * `IPolicyEngine.evaluate()` desde que existe este puente (Fase 5.5b).
 * `asPermissionAsked()` (declarado más abajo, fuera de la clase) hace de
 * type guard runtime contra la forma real, porque el `Event` importado
 * del SDK no la declara. `requestedAt` se completa con `new Date()` al
 * procesar el evento — el payload real no trae ningún timestamp.
 * Verificado real, end-to-end, con el comando exacto que reveló el
 * problema (`agent run ... --model qwen2.5:7b-instruct-q4_K_M`, dos
 * corridas consecutivas): `Estado: succeeded` en ~25-33s, sin cuelgue.
 *
 * Fase 5.9e: con 5.9d ya arreglado, se reprodujo el mismo comando y
 * Santiago reportó `Estado: succeeded` sin ninguna `Salida:` — no era el
 * deadlock (confirmado: el permiso se pidió y se respondió rápido), sino
 * que el turno terminaba sin texto. Verificado real, capturando el
 * historial de la sesión en vivo vía la API REST del propio `opencode
 * serve` mientras corría: el modelo leyó `package.json` con éxito, y
 * después intentó reescribirlo con el texto numerado que le devolvió
 * `read` (sintaxis JSON corrupta) — un permiso de `edit` real,
 * correctamente denegado por `IPolicyEngine` fail-closed (comportamiento
 * de seguridad correcto: se verificó a mano que aprobar esa escritura
 * habría corrompido el archivo real). Después del rechazo, OpenCode no
 * le da al modelo otro turno para responder en texto — el mensaje queda
 * con `finish: "tool-calls"`, sin ninguna parte de tipo `text`, y sin
 * `AssistantMessage.error` tampoco. Antes de este fix, `execute()`
 * reportaba `status: "succeeded"` en ese caso — técnicamente cierto del
 * lado del transporte, pero escondía que el agente no respondió nada.
 * `findFailedToolError()` (declarada más abajo) detecta esta situación
 * específica (sin texto, con una tool call en `state.status: "error"`,
 * que cubre tanto rechazos de permiso como fallos reales de la tool) y
 * la reporta como `status: "failed"` con un `errorMessage` legible.
 *
 * Fase 5.11: al verificar 5.10 (tools de escritura apagadas para el
 * agente `build`) pidiéndole al modelo una edición real, `qwen2.5:
 * 7b-instruct-q4_K_M` canalizó el intento vía la tool `task` — que
 * quedó habilitada — spawneando un subagente `general` con permiso
 * propio para usar las tools que `build` tiene apagadas. Ese subagente
 * tiene su propio `sessionID` real (confirmado en vivo:
 * `session.created` con `properties.info.parentID` apuntando a la
 * sesión principal), y `handlePermissionEvents()` filtraba por igualdad
 * exacta contra `sessionId` — el permiso pedido desde el subagente
 * nunca coincidía, nunca se evaluaba, nunca se respondía. El turno
 * quedaba colgado hasta que `EXECUTION_TIMEOUT_MS` (Fase 5.9c) lo
 * cortaba a los 120s en vez de fallar rápido. `sessionFamily` (un
 * `Set<string>`, arranca con `sessionId`) crece cada vez que se ve un
 * `session.created` real cuyo `parentID` ya está en la familia —
 * cualquier `permission.asked` de un miembro de esa familia (la sesión
 * principal o cualquier subagente descendiente) ahora se evalúa igual.
 * `postSessionIdPermissionsPermissionId` pasa a usar el `sessionID` real
 * dueño del permiso en el path (puede ser el del subagente, no
 * `sessionId`) — la API lo exige por sesión.
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
            // Spread condicional (mismo patrón que `output` más abajo): sin
            // `options.systemPrompt` el body queda EXACTAMENTE como antes de
            // Fase 5.14 — ni siquiera con la clave en `undefined`.
            ...(options.systemPrompt !== undefined ? { system: options.systemPrompt } : {}),
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

        if (info.error) {
          return {
            planId: plan.id,
            status: "failed",
            errorMessage: JSON.stringify(info.error),
            finishedAt: new Date(),
          };
        }

        // Sin texto de salida, OpenCode no siempre marca AssistantMessage.error
        // — un tool call rechazado (permiso denegado, fail-closed) o fallido
        // deja el turno sin ninguna parte de texto, pero `info.error` queda
        // undefined (Fase 5.9e, ver JSDoc de clase). Reportarlo igual como
        // "succeeded" sin salida sería engañoso: el agente no le contestó
        // nada al usuario y la razón real (qué tool falló y por qué) queda
        // disponible en `findFailedToolError`.
        if (output === undefined) {
          const toolError = findFailedToolError(parts);
          if (toolError !== undefined) {
            return {
              planId: plan.id,
              status: "failed",
              errorMessage: toolError,
              finishedAt: new Date(),
            };
          }
        }

        return {
          planId: plan.id,
          status: "succeeded",
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
    // `sessionFamily` empieza con la sesión principal y crece con cada
    // subagente real que se vea nacer de ella (Fase 5.11) — ver JSDoc de
    // clase para el hallazgo que motivó esto.
    const sessionFamily = new Set<string>([sessionId]);

    for await (const event of stream) {
      const createdChild = asSessionCreated(event);
      if (createdChild) {
        if (
          createdChild.properties.info.parentID !== undefined &&
          sessionFamily.has(createdChild.properties.info.parentID)
        ) {
          sessionFamily.add(createdChild.properties.sessionID);
        }
        continue;
      }

      const permission = asPermissionAsked(event);
      if (!permission || !sessionFamily.has(permission.properties.sessionID)) continue;

      // TEMPORAL (Fase 6.1, docs/fase-6-developer-tools-map.md §4) — remover
      // una vez capturada y documentada en roadmap-maestro.md la forma real
      // de `permission.asked.properties` para "edit" contra un servidor real
      // (Ollama + `opencode serve`, no disponible en el entorno donde se
      // escribió `AllowScopedMutationRule`, Fase 6.3). Acotado a "edit" para
      // no ensuciar el log con read/bash/webfetch, ya verificados en 6r.
      if (permission.properties.permission === "edit") {
        console.error(
          `[Fase 6.1] permission.asked real para "edit":\n${JSON.stringify(permission.properties, null, 2)}`,
        );
      }

      const request: ToolRequest = {
        id: permission.properties.id,
        sessionId: permission.properties.sessionID,
        toolName: permission.properties.permission,
        input: permission.properties.metadata,
        requestedAt: new Date(),
      };
      const decision = await this.policyEngine.evaluate(request, policyContext);

      // El path usa el sessionID real dueño del permiso (puede ser un
      // subagente, no `sessionId`) — la API lo exige por sesión.
      await this.client.postSessionIdPermissionsPermissionId({
        path: { id: permission.properties.sessionID, permissionID: permission.properties.id },
        body: { response: decision.allowed ? "once" : "reject" },
      });
    }
  }
}

/**
 * Forma real del evento que `opencode serve` v1.18.18 emite al pedir un
 * permiso — verificada en vivo (Fase 5.9d) contra `GET /doc` (spec
 * OpenAPI servida por el propio binario, `components.schemas.
 * EventPermissionAsked`/`PermissionAsked`) y contra el stream SSE real de
 * `GET /event`, disparando a propósito un permiso `external_directory`
 * real. Los tipos generados de `@opencode-ai/sdk` (`Event`,
 * `EventPermissionUpdated`, `Permission`) — el mismo número de versión,
 * "1.18.18", que el binario — NO coinciden con lo que el binario real
 * emite: declaran `type: "permission.updated"` con
 * `properties.type`/`properties.time.created`, pero el servidor real
 * jamás emitió ese tipo de evento en ningún experimento — emite
 * `"permission.asked"`, con `properties.permission` (no `.type`) y sin
 * ningún campo `time`. Esta discrepancia (paquete npm desincronizado del
 * binario que dice acompañar) es la causa raíz confirmada del deadlock
 * de Fase 5.9c: el filtro anterior (`event.type !== "permission.updated"`)
 * nunca coincidía con nada real, así que ningún permiso pedido de verdad
 * llegaba jamás a `IPolicyEngine.evaluate()` — `session.prompt()`
 * esperaba para siempre una respuesta que este archivo nunca llegaba a
 * enviar. Confirmado el cierre completo del ciclo respondiendo
 * manualmente (`POST /session/{id}/permissions/{permissionID}`, sin
 * cambios — ese endpoint sí funciona como documenta el SDK) a un permiso
 * real capturado así: `session.prompt()`, que llevaba minutos colgado,
 * resolvió al instante.
 *
 * Sin `time` en el payload real, `requestedAt` se completa con
 * `new Date()` al momento de procesar el evento — no hay ningún
 * timestamp del lado del servidor que extraer para este evento.
 */
interface RealPermissionAskedEvent {
  readonly type: "permission.asked";
  readonly properties: {
    readonly id: string;
    readonly sessionID: string;
    readonly permission: string;
    readonly metadata: Record<string, unknown>;
  };
}

function asPermissionAsked(event: Event): RealPermissionAskedEvent | undefined {
  return (event as unknown as { type?: unknown }).type === "permission.asked"
    ? (event as unknown as RealPermissionAskedEvent)
    : undefined;
}

/**
 * Forma real de `session.created` (Fase 5.11) — verificada en vivo igual
 * que `asPermissionAsked`: a diferencia de `permission.updated` (Fase
 * 5.9d), este evento SÍ coincide con lo que documenta
 * `components.schemas.EventSessionCreated` del `GET /doc` real. Se
 * necesita porque OpenCode puede canalizar una tool call vía la tool
 * `task` (spawnea un subagente, p. ej. `agent: "general"`) — ese
 * subagente tiene su propio `sessionID` real, distinto del `plan.id` que
 * `execute()` rastrea, y sus `permission.asked` quedaban invisibles para
 * este puente: `handlePermissionEvents()` filtraba por igualdad exacta
 * de `sessionID`, así que un permiso pedido desde un subagente nunca se
 * evaluaba ni se respondía — el turno quedaba colgado hasta que
 * `EXECUTION_TIMEOUT_MS` (`apps/cli/src/commands/agent.ts`, Fase 5.9c)
 * lo cortaba a los 120s. `properties.info.parentID` (real, confirmado
 * contra el stream SSE real disparando un subagente de verdad) es lo que
 * permite reconstruir el árbol de sesiones.
 */
interface RealSessionCreatedEvent {
  readonly type: "session.created";
  readonly properties: {
    readonly sessionID: string;
    readonly info: { readonly parentID?: string };
  };
}

function asSessionCreated(event: Event): RealSessionCreatedEvent | undefined {
  return (event as unknown as { type?: unknown }).type === "session.created"
    ? (event as unknown as RealSessionCreatedEvent)
    : undefined;
}

function extractText(parts: readonly { type: string; text?: string }[]): string | undefined {
  const textParts = parts.filter(
    (part): part is { type: string; text: string } => part.type === "text" && part.text !== undefined,
  );
  return textParts.length > 0 ? textParts.map((part) => part.text).join("\n") : undefined;
}

/**
 * Busca la primera tool call fallida o rechazada entre las partes de una
 * respuesta sin ningún texto (Fase 5.9e). Caso real que motivó esto: un
 * permiso denegado por `IPolicyEngine` (fail-closed, ver
 * `handlePermissionEvents()`) deja el turno sin ninguna parte de texto
 * — el modelo nunca vuelve a responder después del rechazo — pero
 * `AssistantMessage.error` (`info.error`) queda `undefined` igual, y
 * `session.prompt()` resuelve "bien" del lado del transporte. Sin esto,
 * `execute()` reportaría `status: "succeeded"` sin salida, escondiendo
 * que el agente no le contestó nada al usuario y por qué.
 */
function findFailedToolError(
  parts: readonly { type: string; tool?: string; state?: { status?: string; error?: string } }[],
): string | undefined {
  for (const part of parts) {
    if (part.type === "tool" && part.state?.status === "error" && part.state.error !== undefined) {
      return `Tool "${part.tool ?? "?"}" falló: ${part.state.error}`;
    }
  }
  return undefined;
}

/**
 * Distingue un abort intencional (cleanup del listener de eventos o
 * `timeoutMs`) de un error real de red/protocolo — mismo criterio que
 * `OllamaProvider.fetchWithTimeout`.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
