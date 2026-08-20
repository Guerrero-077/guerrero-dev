import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { GitLogEntry, GitStatusEntry, IGitWorkingTreeSource } from "@guerrero-dev/application";
import { beforeEach, describe, expect, it } from "vitest";
import { buildGitMcpServer } from "./GitMcpServer.js";

/**
 * Mismo patrón que `CodeIntelligenceMcpServer.test.ts`: protocolo MCP real
 * (`McpServer`/`Client` reales) conectados por `InMemoryTransport`, con un
 * doble "tonto" de `IGitWorkingTreeSource` — el dispatch real
 * (`GitToolHandler`) corre de verdad.
 */
const FIXTURE_STATUS: readonly GitStatusEntry[] = [{ statusCode: " M", path: "package.json" }];
const FIXTURE_LOG: readonly GitLogEntry[] = [
  { hash: "a".repeat(40), authorName: "Santiago", authorDate: "2026-08-20T00:00:00Z", subject: "feat: algo" },
];

function fakeWorkingTreeSource(
  behavior: { status?: readonly GitStatusEntry[]; diff?: string; log?: readonly GitLogEntry[]; throws?: Error } = {},
): { source: IGitWorkingTreeSource; calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    source: {
      async getStatus(repoRoot) {
        calls.push({ method: "getStatus", args: [repoRoot] });
        if (behavior.throws) throw behavior.throws;
        return behavior.status ?? FIXTURE_STATUS;
      },
      async getDiff(repoRoot, filePath) {
        calls.push({ method: "getDiff", args: [repoRoot, filePath] });
        if (behavior.throws) throw behavior.throws;
        return behavior.diff ?? "diff --git a/x b/x";
      },
      async getRecentLog(repoRoot, limit) {
        calls.push({ method: "getRecentLog", args: [repoRoot, limit] });
        if (behavior.throws) throw behavior.throws;
        return behavior.log ?? FIXTURE_LOG;
      },
    },
    calls,
  };
}

async function connectedClient(source: IGitWorkingTreeSource, repoRoot = "/repo"): Promise<Client> {
  const server = buildGitMcpServer({ repoRoot, workingTreeSource: source });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("GitMcpServer — protocolo MCP real, extremo a extremo en memoria", () => {
  let workingTreeSource: ReturnType<typeof fakeWorkingTreeSource>;

  beforeEach(() => {
    workingTreeSource = fakeWorkingTreeSource();
  });

  it("tools/list expone los tres tools de Git, sin repoRoot en ningún schema", async () => {
    const client = await connectedClient(workingTreeSource.source);

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(["git_diff", "git_log", "git_status"]);
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("repoRoot");
    }
  });

  it("git_status: usa el repoRoot fijado al construir el servidor, no uno del cliente", async () => {
    const client = await connectedClient(workingTreeSource.source, "/proyecto-real");

    const result = await client.callTool({ name: "git_status", arguments: {} });

    expect(workingTreeSource.calls).toEqual([{ method: "getStatus", args: ["/proyecto-real"] }]);
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({ toolName: "git_status", entries: FIXTURE_STATUS });
  });

  it("git_diff: sin filePath, lo pasa como undefined", async () => {
    const client = await connectedClient(workingTreeSource.source, "/repo");

    const result = await client.callTool({ name: "git_diff", arguments: {} });

    expect(workingTreeSource.calls).toEqual([{ method: "getDiff", args: ["/repo", undefined] }]);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({ toolName: "git_diff", diff: "diff --git a/x b/x" });
  });

  it("git_diff: con filePath, lo pasa tal cual", async () => {
    const client = await connectedClient(workingTreeSource.source, "/repo");

    await client.callTool({ name: "git_diff", arguments: { filePath: "package.json" } });

    expect(workingTreeSource.calls).toEqual([{ method: "getDiff", args: ["/repo", "package.json"] }]);
  });

  it("git_log: sin limit, GitToolHandler aplica su default (20)", async () => {
    const client = await connectedClient(workingTreeSource.source, "/repo");

    const result = await client.callTool({ name: "git_log", arguments: {} });

    expect(workingTreeSource.calls).toEqual([{ method: "getRecentLog", args: ["/repo", 20] }]);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? "")).toEqual({ toolName: "git_log", entries: FIXTURE_LOG });
  });

  it("git_log: con limit, lo pasa tal cual", async () => {
    const client = await connectedClient(workingTreeSource.source, "/repo");

    await client.callTool({ name: "git_log", arguments: { limit: 3 } });

    expect(workingTreeSource.calls).toEqual([{ method: "getRecentLog", args: ["/repo", 3] }]);
  });

  it("un fallo real de IGitWorkingTreeSource llega como isError: true, no como excepción sin capturar", async () => {
    const failing = fakeWorkingTreeSource({ throws: new Error("not_a_repository") });
    const client = await connectedClient(failing.source);

    const result = await client.callTool({ name: "git_status", arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("not_a_repository");
  });

  it("limit inválido (negativo) es rechazado por el propio schema de Zod antes de llegar al handler", async () => {
    const client = await connectedClient(workingTreeSource.source);

    const result = await client.callTool({ name: "git_log", arguments: { limit: -1 } });

    expect(result.isError).toBe(true);
    expect(workingTreeSource.calls).toEqual([]);
  });
});
