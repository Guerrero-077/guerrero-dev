import type { CodeIndex, DependencyEdge } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import { getDependents } from "./getDependents.js";

function edge(overrides: Partial<DependencyEdge> = {}): DependencyEdge {
  return {
    fromFile: "packages/domain/src/code/index.ts",
    target: "./CodeSymbol.js",
    kind: "import",
    importedNames: ["CodeSymbol"],
    ...overrides,
  };
}

describe("getDependents", () => {
  it("resuelve un target './x.js' contra dirname(fromFile), normalizando a .ts", () => {
    const index: CodeIndex = { symbols: [], edges: [edge()] };

    expect(getDependents(index, "packages/domain/src/code/CodeSymbol.ts")).toEqual([edge()]);
  });

  it("resuelve un target '../x.js' que cruza de directorio", () => {
    const crossDir = edge({
      fromFile: "packages/domain/src/memory/Memory.ts",
      target: "../shared/Entity.js",
    });
    const index: CodeIndex = { symbols: [], edges: [crossDir] };

    expect(getDependents(index, "packages/domain/src/shared/Entity.ts")).toEqual([crossDir]);
  });

  it("un target relativo sin extensión conserva su ruta tal cual (no asume .js)", () => {
    const noExtension = edge({ target: "./CodeSymbol" });
    const index: CodeIndex = { symbols: [], edges: [noExtension] };

    expect(getDependents(index, "packages/domain/src/code/CodeSymbol")).toEqual([noExtension]);
    expect(getDependents(index, "packages/domain/src/code/CodeSymbol.ts")).toEqual([]);
  });

  it("NO resuelve un target de paquete, aunque el edge exista en el índice (frontera deliberada)", () => {
    const packageEdge = edge({ target: "@guerrero-dev/domain" });
    const index: CodeIndex = { symbols: [], edges: [packageEdge] };

    expect(getDependents(index, "packages/domain/src/code/CodeSymbol.ts")).toEqual([]);
    expect(index.edges).toContainEqual(packageEdge);
  });

  it("no encuentra dependientes para un archivo sin referencias", () => {
    const index: CodeIndex = { symbols: [], edges: [edge()] };

    expect(getDependents(index, "packages/domain/src/code/DependencyEdge.ts")).toEqual([]);
  });
});
