import { describe, expect, it } from "vitest";
import {
  isKnownCodeSymbolKind,
  isKnownDependencyEdgeKind,
  isRelativeFilePath,
  isValidCodeSymbol,
  isValidDependencyEdge,
  isValidLiteralMatch,
} from "./CodeInvariants.js";
import type { CodeSymbol, CodeSymbolKind } from "./CodeSymbol.js";
import type { DependencyEdge, DependencyEdgeKind } from "./DependencyEdge.js";
import type { LiteralMatch } from "./LiteralMatch.js";

describe("isRelativeFilePath", () => {
  it("acepta una ruta relativa canónica", () => {
    expect(isRelativeFilePath("apps/api/src/index.ts")).toBe(true);
  });

  it("acepta un prefijo './'", () => {
    expect(isRelativeFilePath("./x.ts")).toBe(true);
  });

  it.each(["", "/apps/api", "C:\\Dev\\guerrero-dev", "\\apps\\api", "../apps", "apps/../secret"])(
    "rechaza rutas no relativas o que escapan del root (%s)",
    (value) => {
      expect(isRelativeFilePath(value)).toBe(false);
    },
  );
});

describe("isKnownCodeSymbolKind", () => {
  it.each(["function", "class", "interface", "type", "const", "method"])("acepta %s", (kind) => {
    expect(isKnownCodeSymbolKind(kind)).toBe(true);
  });

  it.each(["enum", "namespace", "variable", ""])("rechaza kinds no congelados (%s)", (kind) => {
    expect(isKnownCodeSymbolKind(kind)).toBe(false);
  });
});

describe("isKnownDependencyEdgeKind", () => {
  it.each(["import", "re-export"])("acepta %s", (kind) => {
    expect(isKnownDependencyEdgeKind(kind)).toBe(true);
  });

  it("rechaza un kind desconocido", () => {
    expect(isKnownDependencyEdgeKind("export")).toBe(false);
  });
});

describe("isValidCodeSymbol", () => {
  const topLevel: CodeSymbol = {
    name: "ProjectProfileMapper",
    kind: "const",
    filePath: "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts",
    line: 20,
    endLine: 48,
    exported: true,
    containerName: null,
  };

  const method: CodeSymbol = {
    name: "toDomain",
    kind: "method",
    filePath: "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts",
    line: 21,
    endLine: 33,
    exported: false,
    containerName: "ProjectProfileMapper",
  };

  it("acepta un símbolo top-level con containerName null", () => {
    expect(isValidCodeSymbol(topLevel)).toBe(true);
  });

  it("acepta un method con containerName y exported: false (caso Mapper)", () => {
    expect(isValidCodeSymbol(method)).toBe(true);
  });

  it("rechaza name vacío", () => {
    expect(isValidCodeSymbol({ ...topLevel, name: "" })).toBe(false);
  });

  it("rechaza kind desconocido", () => {
    expect(isValidCodeSymbol({ ...topLevel, kind: "enum" as CodeSymbolKind })).toBe(false);
  });

  it("rechaza filePath no relativo", () => {
    expect(isValidCodeSymbol({ ...topLevel, filePath: "/etc/passwd" })).toBe(false);
  });

  it("rechaza line menor a 1", () => {
    expect(isValidCodeSymbol({ ...topLevel, line: 0 })).toBe(false);
  });

  it("rechaza endLine menor a line", () => {
    expect(isValidCodeSymbol({ ...topLevel, line: 10, endLine: 9 })).toBe(false);
  });

  it("rechaza un símbolo no-method con containerName distinto de null", () => {
    expect(isValidCodeSymbol({ ...topLevel, containerName: "SomeClass" })).toBe(false);
  });

  it("rechaza un method con containerName null", () => {
    expect(isValidCodeSymbol({ ...method, containerName: null })).toBe(false);
  });

  it("rechaza un method con containerName vacío", () => {
    expect(isValidCodeSymbol({ ...method, containerName: "" })).toBe(false);
  });

  it("rechaza un method con exported: true", () => {
    expect(isValidCodeSymbol({ ...method, exported: true })).toBe(false);
  });
});

describe("isValidDependencyEdge", () => {
  const valid: DependencyEdge = {
    fromFile: "packages/agent-core/src/ContextBuilder.ts",
    target: "@guerrero-dev/application",
    kind: "import",
    importedNames: ["IProjectIntelligenceProvider"],
  };

  it("acepta un DependencyEdge válido", () => {
    expect(isValidDependencyEdge(valid)).toBe(true);
  });

  it("acepta importedNames: ['*'] (namespace import / export * from)", () => {
    expect(isValidDependencyEdge({ ...valid, importedNames: ["*"] })).toBe(true);
  });

  it("acepta importedNames: ['default']", () => {
    expect(isValidDependencyEdge({ ...valid, importedNames: ["default"] })).toBe(true);
  });

  it("acepta importedNames: [] (side-effect import)", () => {
    expect(isValidDependencyEdge({ ...valid, importedNames: [] })).toBe(true);
  });

  it("rechaza fromFile no relativo", () => {
    expect(isValidDependencyEdge({ ...valid, fromFile: "/etc/passwd" })).toBe(false);
  });

  it("rechaza target vacío", () => {
    expect(isValidDependencyEdge({ ...valid, target: "" })).toBe(false);
  });

  it("rechaza kind desconocido", () => {
    expect(isValidDependencyEdge({ ...valid, kind: "export" as DependencyEdgeKind })).toBe(false);
  });

  it("rechaza una entrada vacía en importedNames", () => {
    expect(isValidDependencyEdge({ ...valid, importedNames: ["a", ""] })).toBe(false);
  });
});

describe("isValidLiteralMatch", () => {
  const valid: LiteralMatch = {
    filePath: "packages/agent-core/src/ContextBuilder.ts",
    line: 42,
    text: "  const context = await builder.build(task);",
  };

  it("acepta un match válido", () => {
    expect(isValidLiteralMatch(valid)).toBe(true);
  });

  it("acepta text vacío — el contrato no exige contenido no vacío", () => {
    expect(isValidLiteralMatch({ ...valid, text: "" })).toBe(true);
  });

  it("rechaza filePath no relativo", () => {
    expect(isValidLiteralMatch({ ...valid, filePath: "/etc/passwd" })).toBe(false);
  });

  it.each([0, -1, 1.5, Number.NaN])("rechaza line inválido (%s)", (line) => {
    expect(isValidLiteralMatch({ ...valid, line })).toBe(false);
  });
});
