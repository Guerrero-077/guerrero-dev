import type { AgentTask, ExecutionPlan, PolicyDecision } from "@guerrero-dev/domain";
import type { IPolicyEngine } from "@guerrero-dev/application";
import type { Event, OpencodeClient } from "@opencode-ai/sdk";
import { describe, expect, it } from "vitest";
import { OpenCodeExecutionEngine } from "./OpenCodeExecutionEngine.js";
import { OpenCodeExecutionEngineError } from "./OpenCodeExecutionEngineError.js";

/**
 * Doble de test deliberadamente "tonto" — mismo criterio que
 * `OllamaProvider.test.ts`/`CodeIntelligenceToolHandler.test.ts`. Solo se
 * tipan los métodos que `OpenCodeExecutionEngine` realmente usa
 * (`session.create`/`session.prompt`/`session.abort`/`event.subscribe`/
 * `postSessionIdPermissionsPermissionId`); el resto de `OpencodeClient` no
 * se necesita, de ahí el cast — el contrato real se verificó contra el
 * paquete instalado en `node_modules/@opencode-ai/sdk` antes de escribir
 * esto (Fase 5.5/5.5b).
 */
function fakeClient(handlers: {
  create?: (args: unknown) => Promise<unknown>;
  prompt?: (args: { path: unknown; body: unknown; signal?: AbortSignal }) => Promise<unknown>;
  events?: readonly Event[];
  eventsFactory?: (signal?: AbortSignal) => AsyncGenerator<Event>;
  onPermissionReply?: (args: unknown) => Promise<unknown>;
}): {
  client: OpencodeClient;
  calls: {
    create: unknown[];
    prompt: unknown[];
    eventSubscribe: unknown[];
    permissionReply: unknown[];
    abort: unknown[];
  };
} {
  const calls = {
    create: [] as unknown[],
    prompt: [] as unknown[],
    eventSubscribe: [] as unknown[],
    permissionReply: [] as unknown[],
    abort: [] as unknown[],
  };
  const client = {
    session: {
      async create(args: unknown) {
        calls.create.push(args);
        return handlers.create
          ? await handlers.create(args)
          : { data: { id: "session-1" }, error: undefined };
      },
      async prompt(args: { path: unknown; body: unknown; signal?: AbortSignal }) {
        calls.prompt.push(args);
        return handlers.prompt
          ? await handlers.prompt(args)
          : {
              data: { info: {}, parts: [{ type: "text", text: "ok" }] },
              error: undefined,
            };
      },
      async abort(args: unknown) {
        calls.abort.push(args);
        return { data: true, error: undefined };
      },
    },
    event: {
      async subscribe(args?: { query?: unknown; signal?: AbortSignal }) {
        calls.eventSubscribe.push(args);
        return {
          stream: handlers.eventsFactory
            ? handlers.eventsFactory(args?.signal)
            : toAsyncGenerator(handlers.events ?? []),
        };
      },
    },
    async postSessionIdPermissionsPermissionId(args: unknown) {
      calls.permissionReply.push(args);
      return handlers.onPermissionReply
        ? await handlers.onPermissionReply(args)
        : { data: true, error: undefined };
    },
  } as unknown as OpencodeClient;
  return { client, calls };
}

async function* toAsyncGenerator<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

function fakePolicyEngine(decision: PolicyDecision): { engine: IPolicyEngine; calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    engine: {
      addRule() {},
      async evaluate(request, context) {
        calls.push({ request, context });
        return decision;
      },
    },
    calls,
  };
}

const TEST_PROVIDER_ID = "ollama-test";

const APPROVED_DECISION: PolicyDecision = {
  toolRequestId: "cualquiera",
  allowed: true,
  riskLevel: "low",
  reason: "aprobado",
  decidedAt: new Date("2026-08-18T00:00:00.000Z"),
};

function buildTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    sessionId: "session-1",
    projectId: "project-1",
    userId: "user-1",
    projectRootPath: "/repo",
    instruction: "arregla el bug en el login",
    modelName: "gemma3:4b",
    ...overrides,
  };
}

/**
 * Forma real de `permission.asked` (Fase 5.9d) — NO la forma
 * `permission.updated`/`Permission` que declaran los tipos de
 * `@opencode-ai/sdk` (desincronizados del binario real, ver
 * `asPermissionAsked` en `OpenCodeExecutionEngine.ts`). Sin `time`: el
 * evento real no trae ningún timestamp.
 */
function buildPermissionEvent(propertyOverrides: Record<string, unknown> = {}): Event {
  return {
    type: "permission.asked",
    properties: {
      id: "permission-1",
      sessionID: "session-abc",
      permission: "bash",
      patterns: ["*"],
      metadata: { command: "rm -rf /" },
      always: [],
      tool: { messageID: "message-1", callID: "call-1" },
      ...propertyOverrides,
    },
  } as unknown as Event;
}

/**
 * Forma real de `session.created` (Fase 5.11) — a diferencia de
 * `permission.updated`, este SÍ coincide con lo que declara el SDK, pero
 * el campo relevante (`properties.info.parentID`) hay que armarlo a
 * mano igual porque `fakeClient`/`Event` no modelan la forma completa de
 * `Session`.
 */
function buildSessionCreatedEvent(sessionID: string, parentID: string): Event {
  return {
    type: "session.created",
    properties: { sessionID, info: { parentID } },
  } as unknown as Event;
}

describe("OpenCodeExecutionEngine.plan()", () => {
  it("crea una sesión real con directory=task.projectRootPath y usa session.id como ExecutionPlan.id", async () => {
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const engine = new OpenCodeExecutionEngine(client, policyEngine, TEST_PROVIDER_ID);

    const plan = await engine.plan(buildTask({ projectRootPath: "/home/user/proyecto" }));

    expect(calls.create).toEqual([{ query: { directory: "/home/user/proyecto" } }]);
    expect(plan.id).toBe("session-abc");
    expect(plan.steps).toEqual([{ description: "arregla el bug en el login" }]);
  });

  it("session.create() con error de transporte lanza OpenCodeExecutionEngineError con reason request_failed", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: undefined, error: { message: "Bad Request" } }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const engine = new OpenCodeExecutionEngine(client, policyEngine, TEST_PROVIDER_ID);

    const error = await engine.plan(buildTask()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OpenCodeExecutionEngineError);
    expect((error as OpenCodeExecutionEngineError).reason).toBe("request_failed");
  });

  it("un rechazo de la promesa del cliente se propaga sin envolver — todo o nada", async () => {
    const networkError = new Error("ECONNREFUSED");
    const { client } = fakeClient({
      create: async () => {
        throw networkError;
      },
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const engine = new OpenCodeExecutionEngine(client, policyEngine, TEST_PROVIDER_ID);

    await expect(engine.plan(buildTask())).rejects.toBe(networkError);
  });
});

describe("OpenCodeExecutionEngine.execute() — sin plan() previo", () => {
  it("lanza OpenCodeExecutionEngineError con reason missing_policy_context", async () => {
    const { client } = fakeClient({});
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const engine = new OpenCodeExecutionEngine(client, policyEngine, TEST_PROVIDER_ID);
    const orphanPlan: ExecutionPlan = {
      id: "session-nunca-planeada",
      taskId: "task-1",
      steps: [{ description: "x" }],
      createdAt: new Date(),
    };

    const error = await engine.execute(orphanPlan, {}).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OpenCodeExecutionEngineError);
    expect((error as OpenCodeExecutionEngineError).reason).toBe("missing_policy_context");
  });
});

async function planned(client: OpencodeClient, policyEngine: IPolicyEngine, task = buildTask()) {
  const engine = new OpenCodeExecutionEngine(client, policyEngine, TEST_PROVIDER_ID);
  const plan = await engine.plan(task);
  return { engine, plan };
}

describe("OpenCodeExecutionEngine.execute() — respuesta del prompt", () => {
  it("envía session.prompt() con path.id=plan.id, model.providerID/modelID y el texto de plan.steps[0].description — sin body.system si no vino options.systemPrompt", async () => {
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(
      client,
      policyEngine,
      buildTask({ modelName: "qwen2.5-coder:7b" }),
    );

    await engine.execute(plan, {});

    expect(calls.prompt).toEqual([
      {
        path: { id: "session-abc" },
        body: {
          model: { providerID: TEST_PROVIDER_ID, modelID: "qwen2.5-coder:7b" },
          parts: [{ type: "text", text: "arregla el bug en el login" }],
        },
        signal: expect.any(AbortSignal),
      },
    ]);
    // `toEqual` ignora claves cuyo valor es `undefined`, así que por sí solo
    // NO distingue "sin clave `system`" de "`system: undefined`". La
    // diferencia importa: la garantía de Fase 5.14 es que sin contexto el
    // body sale idéntico al de antes, no "casi idéntico".
    const [promptCall] = calls.prompt as [{ body: Record<string, unknown> }];
    expect("system" in promptCall.body).toBe(false);
  });

  it("con options.systemPrompt, lo manda como body.system de session.prompt() — el canal real por el que el contexto llega al modelo (Fase 5.14)", async () => {
    const systemPrompt = [
      "Eres el agente de Guerrero Dev trabajando en el proyecto project-1.",
      "",
      "Tecnologías: TypeScript.",
    ].join("\n");
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(
      client,
      policyEngine,
      buildTask({ modelName: "qwen2.5-coder:7b" }),
    );

    await engine.execute(plan, { systemPrompt });

    expect(calls.prompt).toEqual([
      {
        path: { id: "session-abc" },
        body: {
          model: { providerID: TEST_PROVIDER_ID, modelID: "qwen2.5-coder:7b" },
          system: systemPrompt,
          // `parts` sigue llevando SOLO la instrucción del usuario: el contexto
          // va por `system`, separado, no concatenado al pedido real.
          parts: [{ type: "text", text: "arregla el bug en el login" }],
        },
        signal: expect.any(AbortSignal),
      },
    ]);
  });

  it("sin AssistantMessage.error: status succeeded, output con las partes de texto unidas", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: async () => ({
        data: {
          info: {},
          parts: [
            { type: "text", text: "primera línea" },
            { type: "tool", toolCallId: "x" },
            { type: "text", text: "segunda línea" },
          ],
        },
        error: undefined,
      }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const result = await engine.execute(plan, {});

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("primera línea\nsegunda línea");
    expect(result.planId).toBe("session-abc");
    expect(result.errorMessage).toBeUndefined();
  });

  it("con AssistantMessage.error: status failed, errorMessage con el error serializado", async () => {
    const assistantError = { name: "UnknownError", data: { message: "modelo no disponible" } };
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: async () => ({
        data: { info: { error: assistantError }, parts: [] },
        error: undefined,
      }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const result = await engine.execute(plan, {});

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe(JSON.stringify(assistantError));
  });

  it("sin ninguna parte de texto, output queda undefined (no string vacío)", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: async () => ({ data: { info: {}, parts: [] }, error: undefined }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const result = await engine.execute(plan, {});

    expect(result.output).toBeUndefined();
    expect(result.status).toBe("succeeded");
  });

  it("sin texto y con una tool call rechazada/fallida (Fase 5.9e): status failed con el error real, no succeeded en silencio", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: async () => ({
        data: {
          info: {},
          parts: [
            { type: "step-start" },
            {
              type: "tool",
              tool: "write",
              state: {
                status: "error",
                error: "The user rejected permission to use this specific tool call.",
              },
            },
            { type: "step-finish" },
          ],
        },
        error: undefined,
      }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const result = await engine.execute(plan, {});

    expect(result.status).toBe("failed");
    expect(result.output).toBeUndefined();
    expect(result.errorMessage).toBe(
      'Tool "write" falló: The user rejected permission to use this specific tool call.',
    );
  });

  it("session.prompt() con error de transporte lanza OpenCodeExecutionEngineError con reason request_failed", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: async () => ({ data: undefined, error: { message: "Not Found" } }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const error = await engine.execute(plan, {}).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OpenCodeExecutionEngineError);
    expect((error as OpenCodeExecutionEngineError).reason).toBe("request_failed");
  });

  it("un rechazo de la promesa del cliente se propaga sin envolver — todo o nada", async () => {
    const networkError = new Error("ECONNRESET");
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: async () => {
        throw networkError;
      },
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    await expect(engine.execute(plan, {})).rejects.toBe(networkError);
  });
});

describe("OpenCodeExecutionEngine.execute() — puente de permisos (Fase 5.5b, evento real Fase 5.9d)", () => {
  it("un permission.asked de la sesión actual se evalúa y, si allowed, responde once", async () => {
    const event = buildPermissionEvent();
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      events: [event],
    });
    const { engine: policyEngine, calls: policyCalls } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(
      client,
      policyEngine,
      buildTask({ userId: "user-42", projectRootPath: "/repo-x" }),
    );

    await engine.execute(plan, {});

    expect(policyCalls).toEqual([
      {
        request: {
          id: "permission-1",
          sessionId: "session-abc",
          toolName: "bash",
          input: { command: "rm -rf /" },
          requestedAt: expect.any(Date),
        },
        context: { userId: "user-42", projectRootPath: "/repo-x" },
      },
    ]);
    expect(calls.permissionReply).toEqual([
      { path: { id: "session-abc", permissionID: "permission-1" }, body: { response: "once" } },
    ]);
  });

  it("si la decisión es denegada, responde reject (nunca always)", async () => {
    const event = buildPermissionEvent();
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      events: [event],
    });
    const { engine: policyEngine } = fakePolicyEngine({
      toolRequestId: "permission-1",
      allowed: false,
      riskLevel: "high",
      reason: "denegado",
      decidedAt: new Date(),
    });
    const { engine, plan } = await planned(client, policyEngine);

    await engine.execute(plan, {});

    expect(calls.permissionReply).toEqual([
      { path: { id: "session-abc", permissionID: "permission-1" }, body: { response: "reject" } },
    ]);
  });

  it("un permission.asked de otra sesión se ignora", async () => {
    const event = buildPermissionEvent({ sessionID: "otra-sesion" });
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      events: [event],
    });
    const { engine: policyEngine, calls: policyCalls } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    await engine.execute(plan, {});

    expect(policyCalls).toEqual([]);
    expect(calls.permissionReply).toEqual([]);
  });

  it("un permission.asked de un subagente real (session.created con parentID de la sesión principal) se evalúa y responde con el sessionID del subagente (Fase 5.11)", async () => {
    const sessionCreated = buildSessionCreatedEvent("session-subagent", "session-abc");
    const permissionFromSubagent = buildPermissionEvent({ sessionID: "session-subagent" });
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      events: [sessionCreated, permissionFromSubagent],
    });
    const { engine: policyEngine, calls: policyCalls } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    await engine.execute(plan, {});

    expect(policyCalls).toEqual([
      {
        request: {
          id: "permission-1",
          sessionId: "session-subagent",
          toolName: "bash",
          input: { command: "rm -rf /" },
          requestedAt: expect.any(Date),
        },
        context: { userId: "user-1", projectRootPath: "/repo" },
      },
    ]);
    expect(calls.permissionReply).toEqual([
      { path: { id: "session-subagent", permissionID: "permission-1" }, body: { response: "once" } },
    ]);
  });

  it("un permission.asked de una sesión creada sin relación a la principal (parentID distinto) se sigue ignorando", async () => {
    const sessionCreated = buildSessionCreatedEvent("session-no-relacionada", "otra-sesion-padre");
    const permission = buildPermissionEvent({ sessionID: "session-no-relacionada" });
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      events: [sessionCreated, permission],
    });
    const { engine: policyEngine, calls: policyCalls } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    await engine.execute(plan, {});

    expect(policyCalls).toEqual([]);
    expect(calls.permissionReply).toEqual([]);
  });

  it("si policyEngine.evaluate() falla, aborta la sesión real y propaga el error sin envolver", async () => {
    const event = buildPermissionEvent();
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      events: [event],
    });
    const evaluateError = new Error("PolicyEvaluator no disponible");
    const policyEngine: IPolicyEngine = {
      addRule() {},
      async evaluate() {
        throw evaluateError;
      },
    };
    const { engine, plan } = await planned(client, policyEngine);

    await expect(engine.execute(plan, {})).rejects.toBe(evaluateError);
    expect(calls.abort).toEqual([{ path: { id: "session-abc" } }]);
  });
});

/**
 * Regresión del hang real (confirmado empíricamente contra un servidor
 * `opencode serve` real, ver JSDoc de clase de `OpenCodeExecutionEngine`):
 * el stream de `event.subscribe()` no se cierra solo cuando la sesión
 * termina — solo lo hace si se cancela vía el `AbortSignal` recibido.
 * Estos generadores simulan exactamente eso: nunca producen ningún
 * evento ni terminan por su cuenta, solo reaccionan cuando `execute()`
 * aborta el controller compartido tras `session.prompt()`. Si el fix
 * estuviera ausente o roto, la promesa interna nunca se resuelve y el
 * test falla por su propio timeout (tercer argumento de `it`) en vez de
 * colgar el runner entero.
 */
function neverEndingUntilAborted(signal?: AbortSignal): AsyncGenerator<Event> {
  return (async function* () {
    await new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    // Simula reader.cancel(): el stream termina prolijamente tras el abort.
  })();
}

function throwsAbortErrorOnAbort(signal?: AbortSignal): AsyncGenerator<Event> {
  return (async function* () {
    await new Promise<void>((_resolve, reject) => {
      signal?.addEventListener(
        "abort",
        () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        },
        { once: true },
      );
    });
  })();
}

describe("OpenCodeExecutionEngine.execute() — regresión del hang (fix)", () => {
  it("sin ningún permission.updated y sin que el stream de eventos se cierre solo, execute() igual resuelve apenas prompt() responde", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      eventsFactory: neverEndingUntilAborted,
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const result = await engine.execute(plan, {});

    expect(result.status).toBe("succeeded");
  }, 2000);

  it("si el cierre del stream lanza AbortError en vez de terminar prolijamente, se trata como benigno: no aborta la sesión real ni propaga el error", async () => {
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      eventsFactory: throwsAbortErrorOnAbort,
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const result = await engine.execute(plan, {});

    expect(result.status).toBe("succeeded");
    expect(calls.abort).toEqual([]);
  }, 2000);

  it("options.timeoutMs aborta session.prompt() si no respondió a tiempo y lanza OpenCodeExecutionEngineError con reason timeout", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
      prompt: (args) =>
        new Promise((_resolve, reject) => {
          args.signal?.addEventListener(
            "abort",
            () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            },
            { once: true },
          );
        }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    const error = await engine.execute(plan, { timeoutMs: 5 }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OpenCodeExecutionEngineError);
    expect((error as OpenCodeExecutionEngineError).reason).toBe("timeout");
    expect((error as OpenCodeExecutionEngineError).message).toMatch(/no respondió dentro de 5ms/);
  });
});
