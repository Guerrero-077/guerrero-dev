import type { ToolRequest } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import type { GitLogEntry, GitStatusEntry, IGitWorkingTreeSource } from "../ports/IGitWorkingTreeSource.js";
import { GitToolHandler } from "./GitToolHandler.js";
import { GitToolHandlerError } from "./GitToolHandlerError.js";

const FIXTURE_STATUS: readonly GitStatusEntry[] = [
  { statusCode: " M", path: "packages/agent-core/src/AgentOrchestrator.ts" },
  { statusCode: "??", path: "scratch.txt" },
];

const FIXTURE_LOG: readonly GitLogEntry[] = [
  { hash: "a".repeat(40), authorName: "Santiago", authorDate: "2026-08-18T00:00:00Z", subject: "feat: algo" },
];

function fakeWorkingTreeSource(
  overrides: Partial<{
    status: readonly GitStatusEntry[];
    diff: string;
    log: readonly GitLogEntry[];
  }> = {},
): {
  source: IGitWorkingTreeSource;
  statusCalls: string[];
  diffCalls: Array<{ repoRoot: string; filePath: string | undefined }>;
  logCalls: Array<{ repoRoot: string; limit: number }>;
} {
  const statusCalls: string[] = [];
  const diffCalls: Array<{ repoRoot: string; filePath: string | undefined }> = [];
  const logCalls: Array<{ repoRoot: string; limit: number }> = [];

  return {
    source: {
      async getStatus(repoRoot) {
        statusCalls.push(repoRoot);
        return overrides.status ?? FIXTURE_STATUS;
      },
      async getDiff(repoRoot, filePath) {
        diffCalls.push({ repoRoot, filePath });
        return overrides.diff ?? "diff --git a/x b/x";
      },
      async getRecentLog(repoRoot, limit) {
        logCalls.push({ repoRoot, limit });
        return overrides.log ?? FIXTURE_LOG;
      },
    },
    statusCalls,
    diffCalls,
    logCalls,
  };
}

function buildRequest(overrides: Partial<ToolRequest> = {}): ToolRequest {
  return {
    id: "request-1",
    sessionId: "session-1",
    toolName: "git_status",
    input: {},
    requestedAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("GitToolHandler.handle() — dispatch por toolName", () => {
  it("git_status: delega en getStatus(repoRoot) sin input", async () => {
    const { source, statusCalls } = fakeWorkingTreeSource();
    const handler = new GitToolHandler(source);

    const result = await handler.handle(buildRequest({ toolName: "git_status" }), "/repo");

    expect(statusCalls).toEqual(["/repo"]);
    expect(result).toEqual({ toolName: "git_status", entries: FIXTURE_STATUS });
  });

  it("git_diff: sin filePath, pide el diff completo", async () => {
    const { source, diffCalls } = fakeWorkingTreeSource({ diff: "diff completo" });
    const handler = new GitToolHandler(source);

    const result = await handler.handle(buildRequest({ toolName: "git_diff", input: {} }), "/repo");

    expect(diffCalls).toEqual([{ repoRoot: "/repo", filePath: undefined }]);
    expect(result).toEqual({ toolName: "git_diff", diff: "diff completo" });
  });

  it("git_diff: con filePath, lo pasa tal cual a getDiff", async () => {
    const { source, diffCalls } = fakeWorkingTreeSource();
    const handler = new GitToolHandler(source);

    await handler.handle(
      buildRequest({ toolName: "git_diff", input: { filePath: "package.json" } }),
      "/repo",
    );

    expect(diffCalls).toEqual([{ repoRoot: "/repo", filePath: "package.json" }]);
  });

  it("git_log: sin limit, usa el default (20)", async () => {
    const { source, logCalls } = fakeWorkingTreeSource();
    const handler = new GitToolHandler(source);

    const result = await handler.handle(buildRequest({ toolName: "git_log", input: {} }), "/repo");

    expect(logCalls).toEqual([{ repoRoot: "/repo", limit: 20 }]);
    expect(result).toEqual({ toolName: "git_log", entries: FIXTURE_LOG });
  });

  it("git_log: con limit, lo pasa tal cual a getRecentLog", async () => {
    const { source, logCalls } = fakeWorkingTreeSource();
    const handler = new GitToolHandler(source);

    await handler.handle(buildRequest({ toolName: "git_log", input: { limit: 5 } }), "/repo");

    expect(logCalls).toEqual([{ repoRoot: "/repo", limit: 5 }]);
  });
});

describe("GitToolHandler.handle() — errores", () => {
  it("toolName desconocido lanza GitToolHandlerError con reason unknown_tool", async () => {
    const { source } = fakeWorkingTreeSource();
    const handler = new GitToolHandler(source);

    const error = await handler
      .handle(buildRequest({ toolName: "delete_everything" }), "/repo")
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(GitToolHandlerError);
    expect((error as GitToolHandlerError).reason).toBe("unknown_tool");
  });

  it.each([
    ["git_diff", "filePath", 42],
    ["git_diff", "filePath", ""],
    ["git_log", "limit", "5"],
    ["git_log", "limit", 0],
    ["git_log", "limit", 1.5],
  ])("%s con input.%s inválido (%j) lanza GitToolHandlerError con reason invalid_input", async (toolName, field, value) => {
    const { source } = fakeWorkingTreeSource();
    const handler = new GitToolHandler(source);

    const error = await handler
      .handle(buildRequest({ toolName, input: { [field]: value } }), "/repo")
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(GitToolHandlerError);
    expect((error as GitToolHandlerError).reason).toBe("invalid_input");
  });

  it("un fallo de workingTreeSource.getStatus() se propaga sin envolver — todo o nada", async () => {
    const statusError = new Error("GitWorkingTreeSourceError: not_a_repository");
    const source: IGitWorkingTreeSource = {
      async getStatus() {
        throw statusError;
      },
      async getDiff() {
        return "";
      },
      async getRecentLog() {
        return [];
      },
    };
    const handler = new GitToolHandler(source);

    await expect(handler.handle(buildRequest({ toolName: "git_status" }), "/repo")).rejects.toBe(statusError);
  });
});
