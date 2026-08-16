import type { CodeIndex, DependencyEdge } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import { getDependencies } from "./getDependencies.js";

function edge(overrides: Partial<DependencyEdge> = {}): DependencyEdge {
  return {
    fromFile: "packages/agent-core/src/ContextBuilder.ts",
    target: "@guerrero-dev/application",
    kind: "import",
    importedNames: ["IProjectIntelligenceProvider"],
    ...overrides,
  };
}

describe("getDependencies", () => {
  it("filtra edges por fromFile exacto", () => {
    const index: CodeIndex = { symbols: [], edges: [edge()] };

    expect(getDependencies(index, "packages/agent-core/src/ContextBuilder.ts")).toEqual([edge()]);
  });

  it("archivo sin edges devuelve []", () => {
    const index: CodeIndex = { symbols: [], edges: [edge()] };

    expect(getDependencies(index, "packages/agent-core/src/AgentOrchestrator.ts")).toEqual([]);
  });

  it("no confunde fromFile con target", () => {
    const index: CodeIndex = { symbols: [], edges: [edge()] };

    expect(getDependencies(index, "@guerrero-dev/application")).toEqual([]);
  });
});
