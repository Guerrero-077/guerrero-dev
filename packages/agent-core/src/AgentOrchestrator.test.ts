import type {
  AgentTask,
  ExecutionOptions,
  ExecutionPlan,
  ExecutionResult,
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

const fakePolicyEngine: IPolicyEngine = {
  addRule() {},
  async evaluate() {
    throw new Error("no debería invocarse todavía — PolicyEngine por-paso es Fase 5.3");
  },
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
});
