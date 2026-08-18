import type { CodeIndex, LiteralMatch, ToolRequest } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import type { ICodeAnalyzer } from "../ports/ICodeAnalyzer.js";
import type { ICodeLiteralSearch } from "../ports/ICodeLiteralSearch.js";
import { CodeIntelligenceToolHandler } from "./CodeIntelligenceToolHandler.js";
import { CodeIntelligenceToolHandlerError } from "./CodeIntelligenceToolHandlerError.js";

/**
 * Dobles de test deliberadamente "tontos" — mismo criterio que
 * `ContextBuilder.test.ts`/`AgentOrchestrator.test.ts`: `findSymbolsByName`/
 * `getDependencies`/`getDependents` corren de verdad (funciones puras ya
 * reales, Fase 6) sobre el `CodeIndex` fijo que devuelve este fake.
 */
const FIXTURE_INDEX: CodeIndex = {
  symbols: [
    {
      name: "AgentOrchestrator",
      kind: "class",
      filePath: "packages/agent-core/src/AgentOrchestrator.ts",
      line: 1,
      endLine: 10,
      exported: true,
      containerName: null,
    },
    {
      name: "AgentOrchestrator",
      kind: "class",
      filePath: "packages/agent-core/src/OtroArchivo.ts",
      line: 1,
      endLine: 5,
      exported: true,
      containerName: null,
    },
  ],
  edges: [
    {
      fromFile: "packages/agent-core/src/AgentOrchestrator.ts",
      target: "./ContextBuilder.js",
      kind: "import",
      importedNames: ["ContextBuilder"],
    },
    {
      fromFile: "packages/agent-core/src/index.ts",
      target: "./AgentOrchestrator.js",
      kind: "import",
      importedNames: ["AgentOrchestrator"],
    },
  ],
};

const FIXTURE_MATCHES: readonly LiteralMatch[] = [
  { filePath: "packages/agent-core/src/AgentOrchestrator.ts", line: 5, text: "todo o nada" },
];

function fakeCodeAnalyzer(index: CodeIndex = FIXTURE_INDEX): {
  analyzer: ICodeAnalyzer;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    analyzer: {
      async analyze(repoRoot) {
        calls.push(repoRoot);
        return index;
      },
    },
    calls,
  };
}

function fakeLiteralSearch(matches: readonly LiteralMatch[] = FIXTURE_MATCHES): {
  search: ICodeLiteralSearch;
  calls: Array<{ repoRoot: string; query: string }>;
} {
  const calls: Array<{ repoRoot: string; query: string }> = [];
  return {
    search: {
      async search(repoRoot, query) {
        calls.push({ repoRoot, query });
        return matches;
      },
    },
    calls,
  };
}

function buildRequest(overrides: Partial<ToolRequest> = {}): ToolRequest {
  return {
    id: "request-1",
    sessionId: "session-1",
    toolName: "find_symbols_by_name",
    input: {},
    requestedAt: new Date("2026-08-18T00:00:00.000Z"),
    ...overrides,
  };
}

describe("CodeIntelligenceToolHandler.handle() — dispatch por toolName", () => {
  it("find_symbols_by_name: analiza repoRoot y filtra por input.name", async () => {
    const { analyzer, calls } = fakeCodeAnalyzer();
    const { search } = fakeLiteralSearch();
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    const result = await handler.handle(
      buildRequest({ toolName: "find_symbols_by_name", input: { name: "AgentOrchestrator" } }),
      "/repo",
    );

    expect(calls).toEqual(["/repo"]);
    expect(result).toEqual({ toolName: "find_symbols_by_name", symbols: FIXTURE_INDEX.symbols });
  });

  it("get_dependencies: analiza repoRoot y filtra por input.filePath", async () => {
    const { analyzer, calls } = fakeCodeAnalyzer();
    const { search } = fakeLiteralSearch();
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    const result = await handler.handle(
      buildRequest({
        toolName: "get_dependencies",
        input: { filePath: "packages/agent-core/src/AgentOrchestrator.ts" },
      }),
      "/repo",
    );

    expect(calls).toEqual(["/repo"]);
    expect(result).toEqual({ toolName: "get_dependencies", edges: [FIXTURE_INDEX.edges[0]] });
  });

  it("get_dependents: analiza repoRoot y filtra por input.filePath", async () => {
    const { analyzer, calls } = fakeCodeAnalyzer();
    const { search } = fakeLiteralSearch();
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    const result = await handler.handle(
      buildRequest({
        toolName: "get_dependents",
        input: { filePath: "packages/agent-core/src/AgentOrchestrator.ts" },
      }),
      "/repo",
    );

    expect(calls).toEqual(["/repo"]);
    expect(result).toEqual({ toolName: "get_dependents", edges: [FIXTURE_INDEX.edges[1]] });
  });

  it("search_literal: llama a literalSearch.search(repoRoot, input.query) sin analizar", async () => {
    const { analyzer, calls: analyzeCalls } = fakeCodeAnalyzer();
    const { search, calls } = fakeLiteralSearch();
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    const result = await handler.handle(
      buildRequest({ toolName: "search_literal", input: { query: "todo o nada" } }),
      "/repo",
    );

    expect(calls).toEqual([{ repoRoot: "/repo", query: "todo o nada" }]);
    expect(analyzeCalls).toEqual([]);
    expect(result).toEqual({ toolName: "search_literal", matches: FIXTURE_MATCHES });
  });
});

describe("CodeIntelligenceToolHandler.handle() — errores", () => {
  it("toolName desconocido lanza CodeIntelligenceToolHandlerError con reason unknown_tool", async () => {
    const { analyzer } = fakeCodeAnalyzer();
    const { search } = fakeLiteralSearch();
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    const error = await handler
      .handle(buildRequest({ toolName: "delete_everything" }), "/repo")
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CodeIntelligenceToolHandlerError);
    expect((error as CodeIntelligenceToolHandlerError).reason).toBe("unknown_tool");
  });

  it.each([
    ["find_symbols_by_name", "name"],
    ["get_dependencies", "filePath"],
    ["get_dependents", "filePath"],
    ["search_literal", "query"],
  ])(
    "%s con input.%s faltante lanza CodeIntelligenceToolHandlerError con reason invalid_input",
    async (toolName, _field) => {
      const { analyzer } = fakeCodeAnalyzer();
      const { search } = fakeLiteralSearch();
      const handler = new CodeIntelligenceToolHandler(analyzer, search);

      const error = await handler
        .handle(buildRequest({ toolName, input: {} }), "/repo")
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(CodeIntelligenceToolHandlerError);
      expect((error as CodeIntelligenceToolHandlerError).reason).toBe("invalid_input");
    },
  );

  it("un fallo de codeAnalyzer.analyze() se propaga sin envolver — todo o nada", async () => {
    const analyzeError = new Error("TsMorphCodeAnalyzerError: syntax_error");
    const analyzer: ICodeAnalyzer = {
      async analyze() {
        throw analyzeError;
      },
    };
    const { search } = fakeLiteralSearch();
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    await expect(
      handler.handle(buildRequest({ toolName: "find_symbols_by_name", input: { name: "x" } }), "/repo"),
    ).rejects.toBe(analyzeError);
  });

  it("un fallo de literalSearch.search() se propaga sin envolver — todo o nada", async () => {
    const { analyzer } = fakeCodeAnalyzer();
    const searchError = new Error("búsqueda literal falló");
    const search: ICodeLiteralSearch = {
      async search() {
        throw searchError;
      },
    };
    const handler = new CodeIntelligenceToolHandler(analyzer, search);

    await expect(
      handler.handle(buildRequest({ toolName: "search_literal", input: { query: "x" } }), "/repo"),
    ).rejects.toBe(searchError);
  });
});
