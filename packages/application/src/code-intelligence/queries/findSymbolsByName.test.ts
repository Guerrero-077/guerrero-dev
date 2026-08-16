import type { CodeIndex, CodeSymbol } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import { findSymbolsByName } from "./findSymbolsByName.js";

function symbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    name: "ContextBuilder",
    kind: "class",
    filePath: "packages/agent-core/src/ContextBuilder.ts",
    line: 1,
    endLine: 10,
    exported: true,
    containerName: null,
    ...overrides,
  };
}

describe("findSymbolsByName", () => {
  it("encuentra símbolos con nombre exactamente igual", () => {
    const index: CodeIndex = { symbols: [symbol()], edges: [] };

    expect(findSymbolsByName(index, "ContextBuilder")).toEqual([symbol()]);
  });

  it("no encuentra con distinta capitalización", () => {
    const index: CodeIndex = { symbols: [symbol()], edges: [] };

    expect(findSymbolsByName(index, "contextbuilder")).toEqual([]);
  });

  it("no encuentra por substring", () => {
    const index: CodeIndex = { symbols: [symbol()], edges: [] };

    expect(findSymbolsByName(index, "Context")).toEqual([]);
  });

  it("índice sin símbolos devuelve []", () => {
    const index: CodeIndex = { symbols: [], edges: [] };

    expect(findSymbolsByName(index, "ContextBuilder")).toEqual([]);
  });

  it("devuelve todas las coincidencias cuando el nombre se repite en distintos containers", () => {
    const a = symbol({ kind: "method", containerName: "MapperA", exported: false });
    const b = symbol({ kind: "method", containerName: "MapperB", exported: false });
    const index: CodeIndex = { symbols: [a, b], edges: [] };

    expect(findSymbolsByName(index, "ContextBuilder")).toEqual([a, b]);
  });
});
