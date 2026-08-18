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
  prompt?: (args: unknown) => Promise<unknown>;
  events?: readonly Event[];
  onPermissionReply?: (args: unknown) => Promise<unknown>;
}): {
  client: OpencodeClient;
  calls: { create: unknown[]; prompt: unknown[]; permissionReply: unknown[]; abort: unknown[] };
} {
  const calls = {
    create: [] as unknown[],
    prompt: [] as unknown[],
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
      async prompt(args: unknown) {
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
      async subscribe() {
        return { stream: toAsyncGenerator(handlers.events ?? []) };
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

function buildPermissionEvent(propertyOverrides: Record<string, unknown> = {}): Event {
  return {
    type: "permission.updated",
    properties: {
      id: "permission-1",
      type: "bash",
      sessionID: "session-abc",
      messageID: "message-1",
      metadata: { command: "rm -rf /" },
      time: { created: 1755000000000 },
      ...propertyOverrides,
    },
  } as Event;
}

describe("OpenCodeExecutionEngine.plan()", () => {
  it("crea una sesión real con directory=task.projectRootPath y usa session.id como ExecutionPlan.id", async () => {
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const engine = new OpenCodeExecutionEngine(client, policyEngine);

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
    const engine = new OpenCodeExecutionEngine(client, policyEngine);

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
    const engine = new OpenCodeExecutionEngine(client, policyEngine);

    await expect(engine.plan(buildTask())).rejects.toBe(networkError);
  });
});

describe("OpenCodeExecutionEngine.execute() — sin plan() previo", () => {
  it("lanza OpenCodeExecutionEngineError con reason missing_policy_context", async () => {
    const { client } = fakeClient({});
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const engine = new OpenCodeExecutionEngine(client, policyEngine);
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
  const engine = new OpenCodeExecutionEngine(client, policyEngine);
  const plan = await engine.plan(task);
  return { engine, plan };
}

describe("OpenCodeExecutionEngine.execute() — respuesta del prompt", () => {
  it("envía session.prompt() con path.id=plan.id y el texto de plan.steps[0].description", async () => {
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
    });
    const { engine: policyEngine } = fakePolicyEngine(APPROVED_DECISION);
    const { engine, plan } = await planned(client, policyEngine);

    await engine.execute(plan, {});

    expect(calls.prompt).toEqual([
      {
        path: { id: "session-abc" },
        body: { parts: [{ type: "text", text: "arregla el bug en el login" }] },
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

describe("OpenCodeExecutionEngine.execute() — puente de permisos (Fase 5.5b)", () => {
  it("un permission.updated de la sesión actual se evalúa y, si allowed, responde once", async () => {
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
          requestedAt: new Date(1755000000000),
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

  it("un permission.updated de otra sesión se ignora", async () => {
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
