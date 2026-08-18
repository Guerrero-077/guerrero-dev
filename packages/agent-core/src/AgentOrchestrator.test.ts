import type {
  AgentTask,
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
  PolicyDecision,
  ProjectProfile,
} from "@guerrero-dev/domain";
import type {
  IExecutionEngine,
  ILLMProvider,
  IPolicyEngine,
  IProjectIntelligenceProvider,
} from "@guerrero-dev/application";
import { describe, expect, it } from "vitest";
import { AgentOrchestrator } from "./AgentOrchestrator.js";
import { ContextBuilder } from "./ContextBuilder.js";

/**
 * Dobles de test deliberadamente "tontos" — mismo criterio que
 * `ContextBuilder.test.ts`/`ProjectProfileScanner.test.ts`: `ContextBuilder`
 * se compone real, con un `IProjectIntelligenceProvider` fake — no se
 * mockea `ContextBuilder` en sí (es una clase concreta, no un puerto).
 */
function buildTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    sessionId: "session-1",
    projectId: "project-1",
    userId: "user-1",
    projectRootPath: "/tmp/project-1",
    instruction: "arregla el bug en el login",
    modelName: "gemma3:4b",
    ...overrides,
  };
}

function fakeProjectIntelligenceProvider(
  profile: ProjectProfile | null = null,
): IProjectIntelligenceProvider {
  return {
    async getProjectProfile() {
      return profile;
    },
  };
}

function fakeLLMProvider(result: string | Error): { provider: ILLMProvider; calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    provider: {
      kind: "fake",
      async listAvailableModels() {
        return [];
      },
      async generate(input) {
        calls.push(input);
        if (result instanceof Error) throw result;
        return result;
      },
    },
    calls,
  };
}

const FAKE_PLAN: ExecutionPlan = {
  id: "plan-1",
  taskId: "task-1",
  steps: [{ description: "paso único" }],
  createdAt: new Date("2026-08-17T00:00:00.000Z"),
};

function fakeExecutionEngine(result: ExecutionResult): IExecutionEngine {
  return {
    name: "fake-engine",
    async plan() {
      return FAKE_PLAN;
    },
    async execute() {
      return result;
    },
  };
}

/** El FAKE_PLAN por defecto no trae `toolRequest`, así que `selectToolSteps()`
 * da `[]` y este engine nunca debería invocarse en los tests que lo usan tal
 * cual — mismo criterio que `ToolSelector.test.ts`. */
const fakePolicyEngine: IPolicyEngine = {
  addRule() {},
  async evaluate() {
    throw new Error("no debería invocarse — este plan no trae ningún ToolRequest");
  },
};

function fakePolicyEngineWithDecision(decision: PolicyDecision): { engine: IPolicyEngine; calls: unknown[] } {
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

const PLAN_WITH_TOOL_STEP: ExecutionPlan = {
  id: "plan-2",
  taskId: "task-1",
  steps: [
    {
      description: "leer un archivo",
      toolRequest: { sessionId: "session-1", toolName: "read_file", input: { path: "src/index.ts" } },
    },
  ],
  createdAt: new Date("2026-08-17T00:00:00.000Z"),
};

describe("AgentOrchestrator.run()", () => {
  it("llama a ILLMProvider.generate() con modelName/prompt/system derivados de task y del BuiltContext", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const { provider: llmProvider, calls } = fakeLLMProvider("respuesta del LLM");
    const executionEngine = fakeExecutionEngine({
      planId: "plan-1",
      status: "succeeded",
      finishedAt: new Date("2026-08-17T00:00:01.000Z"),
    });
    const orchestrator = new AgentOrchestrator(
      executionEngine,
      fakePolicyEngine,
      contextBuilder,
      llmProvider,
    );

    await orchestrator.run(buildTask({ modelName: "qwen2.5-coder:7b", instruction: "revisa el PR #42" }));

    expect(calls).toEqual([
      {
        modelName: "qwen2.5-coder:7b",
        prompt: "revisa el PR #42",
        system: "Eres el agente de Guerrero Dev trabajando en el proyecto project-1.",
      },
    ]);
  });

  it("incluye llmResponse en el ExecutionResult final, preservando el resto de campos", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const { provider: llmProvider } = fakeLLMProvider("respuesta del LLM");
    const executionEngine = fakeExecutionEngine({
      planId: "plan-1",
      status: "failed",
      errorMessage: "sin motor de ejecución real",
      finishedAt: new Date("2026-08-17T00:00:01.000Z"),
    });
    const orchestrator = new AgentOrchestrator(
      executionEngine,
      fakePolicyEngine,
      contextBuilder,
      llmProvider,
    );

    const result = await orchestrator.run(buildTask());

    expect(result).toEqual({
      planId: "plan-1",
      status: "failed",
      errorMessage: "sin motor de ejecución real",
      finishedAt: new Date("2026-08-17T00:00:01.000Z"),
      llmResponse: "respuesta del LLM",
    });
  });

  it("propaga sin envolver un error de ILLMProvider.generate() — todo o nada", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const llmError = new Error("Ollama no disponible");
    const { provider: llmProvider } = fakeLLMProvider(llmError);
    const executionEngine = fakeExecutionEngine({
      planId: "plan-1",
      status: "succeeded",
      finishedAt: new Date(),
    });
    const orchestrator = new AgentOrchestrator(
      executionEngine,
      fakePolicyEngine,
      contextBuilder,
      llmProvider,
    );

    await expect(orchestrator.run(buildTask())).rejects.toBe(llmError);
  });

  it("no llama a plan()/execute() si el LLM falla", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const { provider: llmProvider } = fakeLLMProvider(new Error("Ollama no disponible"));
    let planCalled = false;
    const executionEngine: IExecutionEngine = {
      name: "fake-engine",
      async plan() {
        planCalled = true;
        return FAKE_PLAN;
      },
      async execute() {
        throw new Error("no debería invocarse");
      },
    };
    const orchestrator = new AgentOrchestrator(
      executionEngine,
      fakePolicyEngine,
      contextBuilder,
      llmProvider,
    );

    await orchestrator.run(buildTask()).catch(() => undefined);

    expect(planCalled).toBe(false);
  });

  it("sigue invocando plan()/execute() con el mismo comportamiento que antes de 5.2", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const { provider: llmProvider } = fakeLLMProvider("ok");
    let executeOptions: ExecutionOptions | undefined;
    const executionEngine: IExecutionEngine = {
      name: "fake-engine",
      async plan() {
        return FAKE_PLAN;
      },
      async execute(_plan, options) {
        executeOptions = options;
        return { planId: FAKE_PLAN.id, status: "succeeded", finishedAt: new Date() };
      },
    };
    const orchestrator = new AgentOrchestrator(
      executionEngine,
      fakePolicyEngine,
      contextBuilder,
      llmProvider,
    );

    const result = await orchestrator.run(buildTask(), { autoApprove: true });

    expect(result.planId).toBe(FAKE_PLAN.id);
    expect(executeOptions).toEqual({ autoApprove: true });
  });

  it("evalúa cada ToolRequest del plan contra IPolicyEngine antes de ejecutar, con id/requestedAt completados y el PolicyContext derivado de task", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const { provider: llmProvider } = fakeLLMProvider("ok");
    const executionEngine: IExecutionEngine = {
      name: "fake-engine",
      async plan() {
        return PLAN_WITH_TOOL_STEP;
      },
      async execute() {
        return {
          planId: PLAN_WITH_TOOL_STEP.id,
          status: "succeeded",
          finishedAt: new Date("2026-08-18T00:00:00.000Z"),
        };
      },
    };
    const { engine: policyEngine, calls } = fakePolicyEngineWithDecision({
      toolRequestId: "cualquiera",
      allowed: true,
      riskLevel: "low",
      reason: "aprobado",
      decidedAt: new Date("2026-08-18T00:00:00.000Z"),
    });
    const orchestrator = new AgentOrchestrator(executionEngine, policyEngine, contextBuilder, llmProvider);

    await orchestrator.run(buildTask({ userId: "user-42", projectRootPath: "/home/user/proyecto" }));

    expect(calls).toHaveLength(1);
    const call = calls[0] as {
      request: { sessionId: string; toolName: string; id: string; requestedAt: Date };
      context: unknown;
    };
    expect(call.request.sessionId).toBe("session-1");
    expect(call.request.toolName).toBe("read_file");
    expect(typeof call.request.id).toBe("string");
    expect(call.request.id.length).toBeGreaterThan(0);
    expect(call.request.requestedAt).toBeInstanceOf(Date);
    expect(call.context).toEqual({ userId: "user-42", projectRootPath: "/home/user/proyecto" });
  });

  it("si PolicyEngine deniega un ToolRequest, corta antes de ejecutar y devuelve status failed con el reason de la decisión", async () => {
    const contextBuilder = new ContextBuilder(fakeProjectIntelligenceProvider(null));
    const { provider: llmProvider } = fakeLLMProvider("respuesta del LLM");
    const executionEngine: IExecutionEngine = {
      name: "fake-engine",
      async plan() {
        return PLAN_WITH_TOOL_STEP;
      },
      async execute() {
        throw new Error("no debería invocarse — PolicyEngine denegó");
      },
    };
    const { engine: policyEngine } = fakePolicyEngineWithDecision({
      toolRequestId: "cualquiera",
      allowed: false,
      riskLevel: "high",
      reason: "Sin reglas configuradas: denegado por defecto (fail-closed).",
      decidedAt: new Date("2026-08-18T00:00:00.000Z"),
    });
    const orchestrator = new AgentOrchestrator(executionEngine, policyEngine, contextBuilder, llmProvider);

    const result = await orchestrator.run(buildTask());

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("Sin reglas configuradas: denegado por defecto (fail-closed).");
    expect(result.planId).toBe(PLAN_WITH_TOOL_STEP.id);
    expect(result.llmResponse).toBe("respuesta del LLM");
  });
});
