import { describe, expect, it } from "vitest";
import { parseChangedFiles } from "./parseChangedFiles.js";

describe("parseChangedFiles", () => {
  it("parsea múltiples rutas, una por línea", () => {
    const stdout = "\npackages/domain/src/memory/Memory.ts\npackages/application/src/memory/index.ts\n";

    expect(parseChangedFiles(stdout)).toEqual([
      "packages/domain/src/memory/Memory.ts",
      "packages/application/src/memory/index.ts",
    ]);
  });

  it("parsea una sola ruta", () => {
    expect(parseChangedFiles("\nREADME.md\n")).toEqual(["README.md"]);
  });

  it("devuelve [] para un commit sin cambios (stdout vacío)", () => {
    expect(parseChangedFiles("")).toEqual([]);
  });

  it("devuelve [] cuando el stdout es solo líneas en blanco", () => {
    expect(parseChangedFiles("\n\n  \n")).toEqual([]);
  });

  it("recorta espacios en blanco alrededor de cada ruta", () => {
    expect(parseChangedFiles("\n  src/index.ts  \n")).toEqual(["src/index.ts"]);
  });
});
