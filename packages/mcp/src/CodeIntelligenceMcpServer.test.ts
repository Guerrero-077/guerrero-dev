import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CodeIndex, LiteralMatch } from "@guerrero-dev/domain";
import type { ICodeAnalyzer, ICodeLiteralSearch } from "@guerrero-dev/application";
import { beforeEach, describe, expect, it } from "vitest";
import { buildCodeIntelligenceMcpServer } from "./CodeIntelligenceMcpServer.js";

/**
 * Verifica el servidor real (`McpServer`) hablando el protocolo MCP real
 * con un `Client` real, conectados por `InMemoryTransport` (mismo patrón
 * documentado por el propio SDK para tests — sin subprocess/stdio, pero
 * sin mockear ninguna clase del SDK). El caso end-to-end contra el
 * binario `opencode` real y `Config.mcp` queda para verificación manual
 * (mismo criterio que 5.9d/5.14: un test unitario no reemplaza esa
 * verificación, la complementa).
 *
 * Dobles de `ICodeAnalyzer`/`ICodeLiteralSearch` "tontos" — mismo criterio
 * que `CodeIntelligenceToolHandler.test.ts`: el dispatch real
 * (`CodeIntelligenceToolHandler`, Fase 5.4b) y las queries puras
 * (`findSymbolsByName`, Fase 6) corren de verdad.
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
  ],
  edges: [
    {
      fromFile: "packages/agent-core/src/AgentOrchestrator.ts",
      target: "./ContextBuilder.js",
      kind: "import",
      importedNames: ["ContextBuilder"],
    },
  ],
};

const FIXTURE_MATCHES: readonly LiteralMatch[] = [
  { filePath: "packages/agent-core/src/AgentOrchestrator.ts", line: 5, text: "todo o nada" },
];

function fakeCodeAnalyzer(
  behavior: { index?: CodeIndex; throws?: Error } = {},
): { analyzer: ICodeAnalyzer; calls: string[] } {
  const calls: string[] = [];
  return {
    analyzer: {
      async analyze(repoRoot) {
        calls.push(repoRoot);
        if (behavior.throws) throw behavior.throws;
        return behavior.index ?? FIXTURE_INDEX;
      },
    },
    calls,
  };
}

function fakeLiteralSearch(
  matches: readonly LiteralMatch[] = FIXTURE_MATCHES,
): { search: ICodeLiteralSearch; calls: Array<{ repoRoot: string; query: string }> } {
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

async function connectedClient(
  codeAnalyzer: ICodeAnalyzer,
  literalSearch: ICodeLiteralSearch,
  repoRoot = "/repo",
): Promise<Client> {
  const server = buildCodeIntelligenceMcpServer({ repoRoot, codeAnalyzer, literalSearch });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("CodeIntelligenceMcpServer — protocolo MCP real, extremo a extremo en memoria", () => {
  let codeAnalyzer: ReturnType<typeof fakeCodeAnalyzer>;
  let literalSearch: ReturnType<typeof fakeLiteralSearch>;

  beforeEach(() => {
    codeAnalyzer = fakeCodeAnalyzer();
    literalSearch = fakeLiteralSearch();
  });

  it("tools/list expone los cuatro tools de Code Intelligence, sin repoRoot en ningún schema", async () => {
    const client = await connectedClient(codeAnalyzer.analyzer, literalSearch.search);

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      "find_symbols_by_name",
      "get_dependencies",
      "get_dependents",
      "search_literal",
    ]);
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("repoRoot");
    }
  });

  it("find_symbols_by_name: usa el repoRoot fijado al construir el servidor, no uno del cliente", async () => {
    const client = await connectedClient(codeAnalyzer.analyzer, literalSearch.search, "/proyecto-real");

    const result = await client.callTool({
      name: "find_symbols_by_name",
      arguments: { name: "AgentOrchestrator" },
    });

    expect(codeAnalyzer.calls).toEqual(["/proyecto-real"]);
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({
      toolName: "find_symbols_by_name",
      symbols: FIXTURE_INDEX.symbols,
    });
  });

  it("get_dependencies: devuelve los edges reales de findSymbolsByName/getDependencies (Fase 6, sin doble)", async () => {
    const client = await connectedClient(codeAnalyzer.analyzer, literalSearch.search);

    const result = await client.callTool({
      name: "get_dependencies",
      arguments: { filePath: "packages/agent-core/src/AgentOrchestrator.ts" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({
      toolName: "get_dependencies",
      edges: FIXTURE_INDEX.edges,
    });
  });

  it("search_literal: llama a literalSearch.search(repoRoot, query) sin pasar por el analyzer", async () => {
    const client = await connectedClient(codeAnalyzer.analyzer, literalSearch.search, "/repo");

    const result = await client.callTool({
      name: "search_literal",
      arguments: { query: "todo o nada" },
    });

    expect(codeAnalyzer.calls).toEqual([]);
    expect(literalSearch.calls).toEqual([{ repoRoot: "/repo", query: "todo o nada" }]);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({
      toolName: "search_literal",
      matches: FIXTURE_MATCHES,
    });
  });

  it("un fallo real de ICodeAnalyzer (p. ej. TsMorphCodeAnalyzerError) llega como isError: true, no como excepción sin capturar", async () => {
    const failingAnalyzer = fakeCodeAnalyzer({ throws: new Error("sintaxis inválida") });
    const client = await connectedClient(failingAnalyzer.analyzer, literalSearch.search);

    const result = await client.callTool({
      name: "find_symbols_by_name",
      arguments: { name: "AgentOrchestrator" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("sintaxis inválida");
  });

  it("input inválido (name vacío) es rechazado por el propio schema de Zod antes de llegar al handler", async () => {
    const client = await connectedClient(codeAnalyzer.analyzer, literalSearch.search);

    const result = await client.callTool({
      name: "find_symbols_by_name",
      arguments: { name: "" },
    });

    // El SDK valida contra el `inputSchema` de Zod antes de invocar nuestro
    // callback y devuelve el rechazo como resultado de tool (isError: true,
    // "MCP error -32602: Input validation error..."), no como excepción de
    // protocolo — verificado real, no asumido: la primera versión de este
    // test esperaba un `rejects.toThrow()` y falló contra el SDK real.
    expect(result.isError).toBe(true);
    expect(codeAnalyzer.calls).toEqual([]);
  });
});
