import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CODE_INTELLIGENCE_REPO_ROOT_ENV } from "@guerrero-dev/mcp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Verificación real de Fase 5.4c: spawnea el binario `node` real sobre
 * `packages/mcp/dist/server.js` ya compilado (requiere `pnpm build` antes,
 * mismo orden que exige CI para `apps/api`), habla el protocolo MCP real
 * por stdio con un `Client` real — no `InMemoryTransport` (eso ya lo cubre
 * `CodeIntelligenceMcpServer.test.ts`) — contra el propio `guerrero-dev`
 * como repo real (dogfooding, mismo criterio que `fase-6-acceptance.test.ts`).
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true".
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

const SERVER_ENTRYPOINT = resolve(process.cwd(), "packages/mcp/dist/server.js");
const REPO_ROOT = process.cwd();

describe.skipIf(!RUN)("Fase 5.4c — CodeIntelligenceMcpServer, extremo a extremo contra guerrero-dev real", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeEach(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRYPOINT],
      env: { ...process.env, [CODE_INTELLIGENCE_REPO_ROOT_ENV]: REPO_ROOT } as Record<string, string>,
    });
    client = new Client({ name: "fase-5-4c-acceptance", version: "0.1.0" });
    await client.connect(transport);
  });

  afterEach(async () => {
    await client.close();
  });

  it("el proceso real arranca, hace el MCP handshake y lista los cuatro tools", async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      "find_symbols_by_name",
      "get_dependencies",
      "get_dependents",
      "search_literal",
    ]);
  });

  it("find_symbols_by_name encuentra AgentOrchestrator real, sin que el cliente pase ninguna ruta", async () => {
    const result = await client.callTool({
      name: "find_symbols_by_name",
      arguments: { name: "AgentOrchestrator" },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "{}") as { symbols: Array<{ filePath: string }> };
    expect(parsed.symbols.some((s) => s.filePath === "packages/agent-core/src/AgentOrchestrator.ts")).toBe(
      true,
    );
  });

  it("get_dependents de ContextBuilder.ts incluye a AgentOrchestrator.ts, que lo importa de verdad", async () => {
    const result = await client.callTool({
      name: "get_dependents",
      arguments: { filePath: "packages/agent-core/src/ContextBuilder.ts" },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]?.text ?? "{}") as { edges: Array<{ fromFile: string }> };
    expect(parsed.edges.some((e) => e.fromFile === "packages/agent-core/src/AgentOrchestrator.ts")).toBe(
      true,
    );
  });

  it("sin GUERRERO_CODE_INTELLIGENCE_REPO_ROOT el proceso falla explícito, no en silencio", async () => {
    const badTransport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRYPOINT],
      env: {} as Record<string, string>,
    });
    const badClient = new Client({ name: "fase-5-4c-acceptance-bad-env", version: "0.1.0" });

    await expect(badClient.connect(badTransport)).rejects.toThrow();
  });
});
