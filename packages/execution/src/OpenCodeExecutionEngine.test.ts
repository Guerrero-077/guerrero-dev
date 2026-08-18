import type { AgentTask, ExecutionPlan } from "@guerrero-dev/domain";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { describe, expect, it } from "vitest";
import { OpenCodeExecutionEngine } from "./OpenCodeExecutionEngine.js";
import { OpenCodeExecutionEngineError } from "./OpenCodeExecutionEngineError.js";

/**
 * Doble de test deliberadamente "tonto" — mismo criterio que
 * `OllamaProvider.test.ts`/`CodeIntelligenceToolHandler.test.ts`. Solo se
 * tipan los dos métodos que `OpenCodeExecutionEngine` realmente usa
 * (`session.create`/`session.prompt`); el resto de `OpencodeClient` no
 * se necesita, de ahí el cast — el contrato real (nombres/formas de
 * `SessionCreateData`/`SessionPromptData`/`SessionCreateResponses`/
 * `SessionPromptResponses`) se verificó contra el paquete instalado en
 * `node_modules/@opencode-ai/sdk` antes de escribir esto.
 */
function fakeClient(handlers: {
  create?: (args: unknown) => Promise<unknown>;
  prompt?: (args: unknown) => Promise<unknown>;
}): { client: OpencodeClient; calls: { create: unknown[]; prompt: unknown[] } } {
  const calls = { create: [] as unknown[], prompt: [] as unknown[] };
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
    },
  } as unknown as OpencodeClient;
  return { client, calls };
}

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

describe("OpenCodeExecutionEngine.plan()", () => {
  it("crea una sesión real con directory=task.projectRootPath y usa session.id como ExecutionPlan.id", async () => {
    const { client, calls } = fakeClient({
      create: async () => ({ data: { id: "session-abc" }, error: undefined }),
    });
    const engine = new OpenCodeExecutionEngine(client);

    const plan = await engine.plan(buildTask({ projectRootPath: "/home/user/proyecto" }));

    expect(calls.create).toEqual([{ query: { directory: "/home/user/proyecto" } }]);
    expect(plan.id).toBe("session-abc");
    expect(plan.steps).toEqual([{ description: "arregla el bug en el login" }]);
  });

  it("session.create() con error de transporte lanza OpenCodeExecutionEngineError con reason request_failed", async () => {
    const { client } = fakeClient({
      create: async () => ({ data: undefined, error: { message: "Bad Request" } }),
    });
    const engine = new OpenCodeExecutionEngine(client);

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
    const engine = new OpenCodeExecutionEngine(client);

    await expect(engine.plan(buildTask())).rejects.toBe(networkError);
  });
});

describe("OpenCodeExecutionEngine.execute()", () => {
  const PLAN: ExecutionPlan = {
    id: "session-abc",
    taskId: "task-1",
    steps: [{ description: "arregla el bug en el login" }],
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
  };

  it("envía session.prompt() con path.id=plan.id y el texto de plan.steps[0].description", async () => {
    const { client, calls } = fakeClient({});
    const engine = new OpenCodeExecutionEngine(client);

    await engine.execute(PLAN, {});

    expect(calls.prompt).toEqual([
      {
        path: { id: "session-abc" },
        body: { parts: [{ type: "text", text: "arregla el bug en el login" }] },
      },
    ]);
  });

  it("sin AssistantMessage.error: status succeeded, output con las partes de texto unidas", async () => {
    const { client } = fakeClient({
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
    const engine = new OpenCodeExecutionEngine(client);

    const result = await engine.execute(PLAN, {});

    expect(result.status).toBe("succeeded");
    expect(result.output).toBe("primera línea\nsegunda línea");
    expect(result.planId).toBe("session-abc");
    expect(result.errorMessage).toBeUndefined();
  });

  it("con AssistantMessage.error: status failed, errorMessage con el error serializado", async () => {
    const assistantError = { name: "UnknownError", data: { message: "modelo no disponible" } };
    const { client } = fakeClient({
      prompt: async () => ({
        data: { info: { error: assistantError }, parts: [] },
        error: undefined,
      }),
    });
    const engine = new OpenCodeExecutionEngine(client);

    const result = await engine.execute(PLAN, {});

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe(JSON.stringify(assistantError));
  });

  it("sin ninguna parte de texto, output queda undefined (no string vacío)", async () => {
    const { client } = fakeClient({
      prompt: async () => ({ data: { info: {}, parts: [] }, error: undefined }),
    });
    const engine = new OpenCodeExecutionEngine(client);

    const result = await engine.execute(PLAN, {});

    expect(result.output).toBeUndefined();
  });

  it("session.prompt() con error de transporte lanza OpenCodeExecutionEngineError con reason request_failed", async () => {
    const { client } = fakeClient({
      prompt: async () => ({ data: undefined, error: { message: "Not Found" } }),
    });
    const engine = new OpenCodeExecutionEngine(client);

    const error = await engine.execute(PLAN, {}).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OpenCodeExecutionEngineError);
    expect((error as OpenCodeExecutionEngineError).reason).toBe("request_failed");
  });

  it("un rechazo de la promesa del cliente se propaga sin envolver — todo o nada", async () => {
    const networkError = new Error("ECONNRESET");
    const { client } = fakeClient({
      prompt: async () => {
        throw networkError;
      },
    });
    const engine = new OpenCodeExecutionEngine(client);

    await expect(engine.execute(PLAN, {})).rejects.toBe(networkError);
  });
});
