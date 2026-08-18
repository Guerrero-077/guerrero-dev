import type { AgentTask, ProjectProfile } from "@guerrero-dev/domain";
import type {
  IMemoryRetriever,
  IProjectIntelligenceProvider,
  MemorySearchResult,
} from "@guerrero-dev/application";
import { describe, expect, it } from "vitest";
import { ContextBuilder } from "./ContextBuilder.js";

/** Doble de test deliberadamente "tonto" — devuelve exactamente lo configurado, registra sus llamadas. */
function fakeProvider(result: ProjectProfile | null): {
  provider: IProjectIntelligenceProvider;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    provider: {
      async getProjectProfile(projectId) {
        calls.push(projectId);
        return result;
      },
    },
    calls,
  };
}

/** Mismo criterio "tonto" que `fakeProvider` — devuelve exactamente lo configurado, registra sus llamadas. */
function fakeMemoryRetriever(result: MemorySearchResult[] = []): {
  retriever: IMemoryRetriever;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    retriever: {
      async search(query) {
        calls.push(query);
        return result;
      },
    },
    calls,
  };
}

function buildMemoryResult(overrides: Partial<MemorySearchResult> = {}): MemorySearchResult {
  return {
    memory: {
      id: "memory-1",
      projectId: "project-1",
      scope: "project",
      type: "fact",
      content: "El proyecto usa pnpm workspaces.",
      status: "active",
      confidence: 0.9,
      importance: 0.5,
      createdAt: new Date("2026-08-16T00:00:00.000Z"),
      updatedAt: new Date("2026-08-16T00:00:00.000Z"),
      lastVerifiedAt: null,
      expiresAt: null,
    },
    score: 0.8,
    reasons: ["similitud semántica alta"],
    ...overrides,
  };
}

function buildTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    sessionId: "session-1",
    projectId: "project-1",
    userId: "user-1",
    projectRootPath: "/tmp/project-1",
    instruction: "arregla el bug en el login",
    modelName: "test-model",
    ...overrides,
  };
}

function buildProfile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    id: "profile-1",
    projectId: "project-1",
    schemaVersion: 1,
    scannedAt: new Date("2026-08-16T12:00:00.000Z"),
    technologies: [],
    components: [],
    dependencies: [],
    structure: [],
    configuration: {},
    ...overrides,
  };
}

describe("ContextBuilder — perfil existente", () => {
  it("consulta getProjectProfile con exactamente task.projectId", async () => {
    const { provider, calls } = fakeProvider(buildProfile());
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    await builder.build(buildTask({ projectId: "proyecto-especifico" }));

    expect(calls).toEqual(["proyecto-especifico"]);
  });

  it("incluye Tecnologías con nombres únicos, en orden de primera aparición", async () => {
    const profile = buildProfile({
      technologies: [
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "package.json",
          evidence: "devDependencies.typescript",
        },
        { name: "Node.js", category: "runtime", sourceFile: "package.json", evidence: "engines.node" },
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "apps/api/package.json",
          evidence: "devDependencies.typescript",
        },
        {
          name: "Fastify",
          category: "framework",
          sourceFile: "apps/api/package.json",
          evidence: "dependencies.fastify",
        },
      ],
    });
    const { provider } = fakeProvider(profile);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).toContain("Tecnologías: TypeScript, Node.js, Fastify.");
  });

  it("incluye Componentes como 'path (type)', uno por línea", async () => {
    const profile = buildProfile({
      components: [
        { name: "api", path: "apps/api", type: "app" },
        { name: "domain", path: "packages/domain", type: "package" },
      ],
    });
    const { provider } = fakeProvider(profile);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).toContain("Componentes:\n- apps/api (app)\n- packages/domain (package)");
  });

  it("messages sigue siendo exactamente [task.instruction]", async () => {
    const { provider } = fakeProvider(buildProfile());
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask({ instruction: "revisa el PR #42" }));

    expect(context.messages).toEqual(["revisa el PR #42"]);
  });

  it("technologies:[] omite la sección de Tecnologías pero conserva Componentes", async () => {
    const profile = buildProfile({
      technologies: [],
      components: [{ name: "api", path: "apps/api", type: "app" }],
    });
    const { provider } = fakeProvider(profile);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).not.toContain("Tecnologías:");
    expect(context.systemPrompt).toContain("Componentes:");
  });

  it("components:[] omite la sección de Componentes pero conserva Tecnologías", async () => {
    const profile = buildProfile({
      technologies: [
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "package.json",
          evidence: "devDependencies.typescript",
        },
      ],
      components: [],
    });
    const { provider } = fakeProvider(profile);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).toContain("Tecnologías:");
    expect(context.systemPrompt).not.toContain("Componentes:");
  });

  it("no muta el ProjectProfile del provider: misma referencia y mismo contenido antes/después de build()", async () => {
    const profile = buildProfile({
      technologies: [
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "package.json",
          evidence: "devDependencies.typescript",
        },
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "apps/api/package.json",
          evidence: "devDependencies.typescript",
        },
      ],
      components: [{ name: "api", path: "apps/api", type: "app" }],
    });
    const technologiesSnapshot = JSON.parse(JSON.stringify(profile.technologies)) as unknown;
    const componentsSnapshot = JSON.parse(JSON.stringify(profile.components)) as unknown;
    const technologiesRef = profile.technologies;
    const componentsRef = profile.components;

    const { provider } = fakeProvider(profile);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);
    await builder.build(buildTask());

    expect(profile.technologies).toBe(technologiesRef);
    expect(profile.components).toBe(componentsRef);
    expect(profile.technologies).toEqual(technologiesSnapshot);
    expect(profile.components).toEqual(componentsSnapshot);
  });
});

describe("ContextBuilder — perfil inexistente", () => {
  it("null produce exactamente el systemPrompt base, sin secciones agregadas", async () => {
    const { provider } = fakeProvider(null);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask({ projectId: "proyecto-sin-escanear" }));

    expect(context.systemPrompt).toBe(
      "Eres el agente de Guerrero Dev trabajando en el proyecto proyecto-sin-escanear.",
    );
  });

  it("null no inventa Tecnologías ni Componentes", async () => {
    const { provider } = fakeProvider(null);
    const { retriever } = fakeMemoryRetriever();
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).not.toContain("Tecnologías:");
    expect(context.systemPrompt).not.toContain("Componentes:");
  });
});

describe("ContextBuilder — memorias", () => {
  it("consulta memoryRetriever.search() con text=task.instruction y projectId=task.projectId", async () => {
    const { provider } = fakeProvider(null);
    const { retriever, calls } = fakeMemoryRetriever([]);
    const builder = new ContextBuilder(provider, retriever);

    await builder.build(buildTask({ instruction: "revisa el PR #42", projectId: "proyecto-x" }));

    expect(calls).toEqual([{ text: "revisa el PR #42", projectId: "proyecto-x" }]);
  });

  it("incluye Memorias relevantes como '- content', una por línea", async () => {
    const { provider } = fakeProvider(null);
    const { retriever } = fakeMemoryRetriever([
      buildMemoryResult({ memory: { ...buildMemoryResult().memory, content: "Usa pnpm, no npm." } }),
      buildMemoryResult({ memory: { ...buildMemoryResult().memory, content: "El login usa JWT." } }),
    ]);
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).toContain("Memorias relevantes:\n- Usa pnpm, no npm.\n- El login usa JWT.");
  });

  it("memories:[] omite la sección de Memorias relevantes", async () => {
    const { provider } = fakeProvider(null);
    const { retriever } = fakeMemoryRetriever([]);
    const builder = new ContextBuilder(provider, retriever);

    const context = await builder.build(buildTask());

    expect(context.systemPrompt).not.toContain("Memorias relevantes:");
  });

  it("un fallo de memoryRetriever.search() se propaga sin envolver — todo o nada", async () => {
    const { provider } = fakeProvider(null);
    const searchError = new Error("OllamaEmbeddingProvider no disponible");
    const retriever: IMemoryRetriever = {
      async search() {
        throw searchError;
      },
    };
    const builder = new ContextBuilder(provider, retriever);

    await expect(builder.build(buildTask())).rejects.toBe(searchError);
  });
});
