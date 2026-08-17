import { describe, expect, it } from "vitest";
import { findLiteralMatches } from "./findLiteralMatches.js";

describe("findLiteralMatches", () => {
  it("encuentra una coincidencia simple en una sola línea", () => {
    const content = "const a = 1;\nconst b = ProjectProfileMapper;\nconst c = 3;\n";

    expect(findLiteralMatches(content, "src/f.ts", "ProjectProfileMapper")).toEqual([
      { filePath: "src/f.ts", line: 2, text: "const b = ProjectProfileMapper;" },
    ]);
  });

  it("encuentra coincidencias en múltiples líneas del mismo archivo", () => {
    const content = "foo();\nbar();\nfoo();\n";

    expect(findLiteralMatches(content, "src/f.ts", "foo")).toEqual([
      { filePath: "src/f.ts", line: 1, text: "foo();" },
      { filePath: "src/f.ts", line: 3, text: "foo();" },
    ]);
  });

  it("produce un solo match aunque la query aparezca varias veces en la misma línea", () => {
    const content = "foo(foo(foo()));\n";

    expect(findLiteralMatches(content, "src/f.ts", "foo")).toEqual([
      { filePath: "src/f.ts", line: 1, text: "foo(foo(foo()));" },
    ]);
  });

  it("case-sensitive — no encuentra con distinta capitalización", () => {
    const content = "const ProjectProfileMapper = {};\n";

    expect(findLiteralMatches(content, "src/f.ts", "projectprofilemapper")).toEqual([]);
  });

  it("query vacío coincide con toda línea — comportamiento documentado, no un bug", () => {
    // Sin '\n' final deliberadamente: con un salto final, split produce una
    // línea vacía adicional al final ("a\nb\nc\n" -> ["a","b","c",""]),
    // comportamiento real y correcto de String.prototype.split, pero
    // ajeno a lo que este test quiere demostrar.
    const content = "a\nb\nc";

    expect(findLiteralMatches(content, "src/f.ts", "")).toEqual([
      { filePath: "src/f.ts", line: 1, text: "a" },
      { filePath: "src/f.ts", line: 2, text: "b" },
      { filePath: "src/f.ts", line: 3, text: "c" },
    ]);
  });

  it("archivo sin coincidencias devuelve []", () => {
    const content = "const a = 1;\nconst b = 2;\n";

    expect(findLiteralMatches(content, "src/f.ts", "nunca-aparece")).toEqual([]);
  });

  it("líneas 1-based, incluida la última línea sin salto final", () => {
    const content = "primera\nsegunda-target";

    expect(findLiteralMatches(content, "src/f.ts", "target")).toEqual([
      { filePath: "src/f.ts", line: 2, text: "segunda-target" },
    ]);
  });

  it("separador \\r\\n no deja '\\r' colgando en text", () => {
    const content = "uno\r\ntarget-dos\r\ntres";

    expect(findLiteralMatches(content, "src/f.ts", "target")).toEqual([
      { filePath: "src/f.ts", line: 2, text: "target-dos" },
    ]);
  });

  it("un '\\r' aislado (sin '\\n') no se trata como salto de línea", () => {
    const content = "uno\rtarget-dos";

    expect(findLiteralMatches(content, "src/f.ts", "target")).toEqual([
      { filePath: "src/f.ts", line: 1, text: "uno\rtarget-dos" },
    ]);
  });
});
