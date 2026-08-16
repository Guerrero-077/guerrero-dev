import { Project } from "ts-morph";
import type { SourceFile } from "ts-morph";
import { describe, expect, it } from "vitest";
import { extractEdges } from "./extractEdges.js";

function sourceFileOf(content: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  return project.createSourceFile("probe.ts", content, { overwrite: true });
}

describe("extractEdges", () => {
  it("import con nombres — importedNames exactos", () => {
    const sf = sourceFileOf('import { a, b } from "./x.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./x.js", kind: "import", importedNames: ["a", "b"] },
    ]);
  });

  it("import type — tratado igual que un import normal, sin distinguir type-only", () => {
    const sf = sourceFileOf('import type { T } from "./types.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./types.js", kind: "import", importedNames: ["T"] },
    ]);
  });

  it("default import — importedNames: ['default']", () => {
    const sf = sourceFileOf('import def from "./y.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./y.js", kind: "import", importedNames: ["default"] },
    ]);
  });

  it("namespace import — importedNames: ['*']", () => {
    const sf = sourceFileOf('import * as ns from "./z.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./z.js", kind: "import", importedNames: ["*"] },
    ]);
  });

  it("side-effect import — importedNames: []", () => {
    const sf = sourceFileOf('import "./side-effect.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./side-effect.js", kind: "import", importedNames: [] },
    ]);
  });

  it("export { a, b } from — kind: 're-export', nombres origen", () => {
    const sf = sourceFileOf('export { a, b } from "./re-a.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./re-a.js", kind: "re-export", importedNames: ["a", "b"] },
    ]);
  });

  it("export { a as b } from — usa el nombre en el módulo origen, no el alias local", () => {
    const sf = sourceFileOf('export { c as d } from "./re-b.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./re-b.js", kind: "re-export", importedNames: ["c"] },
    ]);
  });

  it("export * from — importedNames: ['*']", () => {
    const sf = sourceFileOf('export * from "./re-c.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./re-c.js", kind: "re-export", importedNames: ["*"] },
    ]);
  });

  it("export * as ns from — mismo tratamiento que export *, importedNames: ['*']", () => {
    const sf = sourceFileOf('export * as extra from "./re-d.js";\n');

    expect(extractEdges(sf, "src/f.ts")).toEqual([
      { fromFile: "src/f.ts", target: "./re-d.js", kind: "re-export", importedNames: ["*"] },
    ]);
  });

  it("export { x } local (sin from) NO produce ningún DependencyEdge", () => {
    const sf = sourceFileOf("const x = 1;\nexport { x };\n");

    expect(extractEdges(sf, "src/f.ts")).toEqual([]);
  });

  it("archivo de solo re-exports (patrón application/src/index.ts): 0 imports, todos re-export", () => {
    const sf = sourceFileOf(
      ['export * from "./agent/index.js";', 'export * from "./common/index.js";'].join("\n"),
    );

    const edges = extractEdges(sf, "packages/application/src/index.ts");
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.kind === "re-export")).toBe(true);
    expect(edges.map((e) => e.importedNames)).toEqual([["*"], ["*"]]);
  });

  it("archivo sin ningún import/export-from produce []", () => {
    const sf = sourceFileOf("export const x = 1;\n");

    expect(extractEdges(sf, "src/f.ts")).toEqual([]);
  });
});
