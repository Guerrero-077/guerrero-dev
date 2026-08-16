import { Project } from "ts-morph";
import type { SourceFile } from "ts-morph";
import { describe, expect, it } from "vitest";
import { extractSymbols } from "./extractSymbols.js";

function sourceFileOf(content: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  return project.createSourceFile("probe.ts", content, { overwrite: true });
}

describe("extractSymbols", () => {
  it("extrae function exportada de nivel superior", () => {
    const sf = sourceFileOf("export function foo() {\n  return 1;\n}\n");

    expect(extractSymbols(sf, "src/foo.ts")).toEqual([
      {
        name: "foo",
        kind: "function",
        filePath: "src/foo.ts",
        line: 1,
        endLine: 3,
        exported: true,
        containerName: null,
      },
    ]);
  });

  it("extrae function no exportada", () => {
    const sf = sourceFileOf("function foo() { return 1; }\n");

    expect(extractSymbols(sf, "src/foo.ts")[0]?.exported).toBe(false);
  });

  it("extrae class exportada + sus métodos, incluyendo métodos privados", () => {
    const sf = sourceFileOf("export class Foo {\n  bar() { return 1; }\n  private baz() { return 2; }\n}\n");

    const symbols = extractSymbols(sf, "src/Foo.ts");
    expect(symbols).toEqual([
      {
        name: "Foo",
        kind: "class",
        filePath: "src/Foo.ts",
        line: 1,
        endLine: 4,
        exported: true,
        containerName: null,
      },
      {
        name: "bar",
        kind: "method",
        filePath: "src/Foo.ts",
        line: 2,
        endLine: 2,
        exported: false,
        containerName: "Foo",
      },
      {
        name: "baz",
        kind: "method",
        filePath: "src/Foo.ts",
        line: 3,
        endLine: 3,
        exported: false,
        containerName: "Foo",
      },
    ]);
  });

  it("extrae interface", () => {
    const sf = sourceFileOf("export interface Thing { x: number; }\n");

    expect(extractSymbols(sf, "src/t.ts")).toEqual([
      {
        name: "Thing",
        kind: "interface",
        filePath: "src/t.ts",
        line: 1,
        endLine: 1,
        exported: true,
        containerName: null,
      },
    ]);
  });

  it("extrae type alias", () => {
    const sf = sourceFileOf("export type Alias = string;\n");

    expect(extractSymbols(sf, "src/t.ts")).toEqual([
      {
        name: "Alias",
        kind: "type",
        filePath: "src/t.ts",
        line: 1,
        endLine: 1,
        exported: true,
        containerName: null,
      },
    ]);
  });

  it("const con export separado ('export { x };') queda exported: true", () => {
    const sf = sourceFileOf("const x = 1;\nexport { x };\n");

    expect(extractSymbols(sf, "src/t.ts")).toEqual([
      {
        name: "x",
        kind: "const",
        filePath: "src/t.ts",
        line: 1,
        endLine: 1,
        exported: true,
        containerName: null,
      },
    ]);
  });

  it("const con arrow function permanece kind: 'const', no 'function'", () => {
    const sf = sourceFileOf("export const arrowConst = () => 1;\n");

    expect(extractSymbols(sf, "src/t.ts")).toEqual([
      {
        name: "arrowConst",
        kind: "const",
        filePath: "src/t.ts",
        line: 1,
        endLine: 1,
        exported: true,
        containerName: null,
      },
    ]);
  });

  it("caso Mapper: const con objeto literal + métodos shorthand", () => {
    const sf = sourceFileOf(
      "export const Mapper = {\n  toDomain(row) { return row; },\n  toRow(entity) { return entity; },\n};\n",
    );

    const symbols = extractSymbols(sf, "src/Mapper.ts");
    expect(symbols).toEqual([
      {
        name: "Mapper",
        kind: "const",
        filePath: "src/Mapper.ts",
        line: 1,
        endLine: 4,
        exported: true,
        containerName: null,
      },
      {
        name: "toDomain",
        kind: "method",
        filePath: "src/Mapper.ts",
        line: 2,
        endLine: 2,
        exported: false,
        containerName: "Mapper",
      },
      {
        name: "toRow",
        kind: "method",
        filePath: "src/Mapper.ts",
        line: 3,
        endLine: 3,
        exported: false,
        containerName: "Mapper",
      },
    ]);
  });

  it("objeto literal con propiedad-arrow y propiedad-function-expression también cuentan como method", () => {
    const sf = sourceFileOf(
      "export const Mixed = {\n  arrowProp: (x) => x,\n  funcExprProp: function (x) { return x; },\n  plainValue: 1,\n};\n",
    );

    const methodNames = extractSymbols(sf, "src/t.ts")
      .filter((s) => s.kind === "method")
      .map((s) => s.name);
    expect(methodNames).toEqual(["arrowProp", "funcExprProp"]);
  });

  it("función anidada dentro de otra función NO se indexa", () => {
    const sf = sourceFileOf(
      "export function foo() {\n  function nested() { return 1; }\n  return nested();\n}\n",
    );

    const names = extractSymbols(sf, "src/t.ts").map((s) => s.name);
    expect(names).toEqual(["foo"]);
  });

  it("export default de una función anónima NO se indexa (sin nombre estable)", () => {
    const sf = sourceFileOf("export default function () { return 1; }\n");

    expect(extractSymbols(sf, "src/t.ts")).toEqual([]);
  });

  it("export default de una función con nombre SÍ se indexa como function exportada", () => {
    const sf = sourceFileOf("export default function namedDefault() { return 1; }\n");

    expect(extractSymbols(sf, "src/t.ts")).toEqual([
      {
        name: "namedDefault",
        kind: "function",
        filePath: "src/t.ts",
        line: 1,
        endLine: 1,
        exported: true,
        containerName: null,
      },
    ]);
  });

  it("líneas verificadas contra un archivo real del repo (ProjectProfileMapper.ts, mapa §6)", () => {
    const sf = sourceFileOf(
      [
        "export const ProjectProfileMapper = {",
        "  toDomain(row) {",
        "    return row;",
        "  },",
        "",
        "  toRow(profile) {",
        "    return profile;",
        "  },",
        "};",
      ].join("\n"),
    );

    const symbols = extractSymbols(
      sf,
      "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts",
    );
    const mapper = symbols.find((s) => s.name === "ProjectProfileMapper");
    expect(mapper).toMatchObject({ line: 1, endLine: 9, containerName: null, exported: true });
    const toDomain = symbols.find((s) => s.name === "toDomain");
    expect(toDomain).toMatchObject({ line: 2, endLine: 4, containerName: "ProjectProfileMapper" });
  });
});
