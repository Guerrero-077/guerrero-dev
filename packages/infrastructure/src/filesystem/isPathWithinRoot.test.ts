import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithinRoot } from "./isPathWithinRoot.js";

const ROOT = resolve("/repo/project");

describe("isPathWithinRoot", () => {
  it("acepta el propio root", () => {
    expect(isPathWithinRoot(ROOT, ROOT)).toBe(true);
  });

  it("acepta un archivo dentro del root", () => {
    expect(isPathWithinRoot(ROOT, resolve(ROOT, "src/index.ts"))).toBe(true);
  });

  it("acepta un archivo anidado varios niveles dentro del root", () => {
    expect(isPathWithinRoot(ROOT, resolve(ROOT, "a/b/c/file.ts"))).toBe(true);
  });

  it("rechaza un directorio hermano que comparte prefijo de string (no de directorio)", () => {
    // root = /repo/project, target = /repo/project-other/file.txt — un
    // startsWith(root) ingenuo aceptaría esto porque el string coincide
    // como prefijo; path.relative no, porque no es el mismo directorio.
    const sibling = resolve("/repo/project-other/file.txt");

    expect(isPathWithinRoot(ROOT, sibling)).toBe(false);
  });

  it("rechaza el directorio padre del root", () => {
    expect(isPathWithinRoot(ROOT, resolve("/repo"))).toBe(false);
  });

  it("rechaza un path completamente fuera del árbol del root", () => {
    expect(isPathWithinRoot(ROOT, resolve("/etc/passwd"))).toBe(false);
  });
});
