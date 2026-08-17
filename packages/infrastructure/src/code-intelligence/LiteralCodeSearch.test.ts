import type { IFileReader, IGitTrackedFilesSource } from "@guerrero-dev/application";
import { describe, expect, it } from "vitest";
import { LiteralCodeSearch } from "./LiteralCodeSearch.js";

/**
 * Dobles de test deliberadamente "tontos" — mismo criterio que
 * `TsMorphCodeAnalyzer.test.ts`. El fixture de "contenido real" es un
 * string controlado en el propio test, no una lectura del archivo real
 * en disco — para que una futura edición de `ProjectProfileMapper.ts`
 * nunca rompa este test por una razón ajena al comportamiento probado.
 */
function fakeTrackedFilesSource(files: readonly string[]): IGitTrackedFilesSource {
  return {
    async listTrackedFiles() {
      return files;
    },
  };
}

function fakeFileReader(contents: Readonly<Record<string, string>>): {
  reader: IFileReader;
  calls: Array<{ repoRoot: string; relativePath: string }>;
} {
  const calls: Array<{ repoRoot: string; relativePath: string }> = [];
  return {
    reader: {
      async readFile(repoRoot, relativePath) {
        calls.push({ repoRoot, relativePath });
        const content = contents[relativePath];
        if (content === undefined) {
          throw new Error(`no fixture content for ${relativePath}`);
        }
        return content;
      },
    },
    calls,
  };
}

describe("LiteralCodeSearch", () => {
  it("busca sobre el contenido de los archivos .ts trackeados", async () => {
    const source = fakeTrackedFilesSource(["src/a.ts"]);
    const { reader } = fakeFileReader({ "src/a.ts": "const target = 1;\nconst other = 2;\n" });
    const search = new LiteralCodeSearch(source, reader);

    const matches = await search.search("/repo", "target");

    expect(matches).toEqual([{ filePath: "src/a.ts", line: 1, text: "const target = 1;" }]);
  });

  it("filtra a solo archivos .ts — ignora otras extensiones", async () => {
    const source = fakeTrackedFilesSource(["src/a.ts", "README.md"]);
    const { reader, calls } = fakeFileReader({ "src/a.ts": "target\n" });
    const search = new LiteralCodeSearch(source, reader);

    await search.search("/repo", "target");

    expect(calls).toEqual([{ repoRoot: "/repo", relativePath: "src/a.ts" }]);
  });

  it("agrega coincidencias de varios archivos, en el orden que entrega IGitTrackedFilesSource", async () => {
    const source = fakeTrackedFilesSource(["src/a.ts", "src/b.ts"]);
    const { reader } = fakeFileReader({
      "src/a.ts": "target-a\n",
      "src/b.ts": "target-b\n",
    });
    const search = new LiteralCodeSearch(source, reader);

    const matches = await search.search("/repo", "target");

    expect(matches).toEqual([
      { filePath: "src/a.ts", line: 1, text: "target-a" },
      { filePath: "src/b.ts", line: 1, text: "target-b" },
    ]);
  });

  it("propaga repoRoot exactamente a ambos puertos", async () => {
    const calls: string[] = [];
    const source: IGitTrackedFilesSource = {
      async listTrackedFiles(repoRoot) {
        calls.push(repoRoot);
        return ["src/a.ts"];
      },
    };
    const { reader, calls: readerCalls } = fakeFileReader({ "src/a.ts": "x\n" });
    const search = new LiteralCodeSearch(source, reader);

    await search.search("/algun/repo", "x");

    expect(calls).toEqual(["/algun/repo"]);
    expect(readerCalls).toEqual([{ repoRoot: "/algun/repo", relativePath: "src/a.ts" }]);
  });

  it("sin archivos .ts trackeados devuelve []", async () => {
    const source = fakeTrackedFilesSource([]);
    const { reader } = fakeFileReader({});
    const search = new LiteralCodeSearch(source, reader);

    expect(await search.search("/repo", "cualquier-cosa")).toEqual([]);
  });

  it("sin coincidencias en ningún archivo devuelve []", async () => {
    const source = fakeTrackedFilesSource(["src/a.ts"]);
    const { reader } = fakeFileReader({ "src/a.ts": "nada relevante aquí\n" });
    const search = new LiteralCodeSearch(source, reader);

    expect(await search.search("/repo", "no-existe")).toEqual([]);
  });

  it("localiza el nombre de un símbolo real conocido dentro de un fixture que reproduce un Mapper", async () => {
    const source = fakeTrackedFilesSource([
      "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts",
    ]);
    const fixture = [
      "export const ProjectProfileMapper = {",
      "  toDomain(row) {",
      "    return row;",
      "  },",
      "};",
    ].join("\n");
    const { reader } = fakeFileReader({
      "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts": fixture,
    });
    const search = new LiteralCodeSearch(source, reader);

    const matches = await search.search("/repo", "ProjectProfileMapper");

    expect(matches).toEqual([
      {
        filePath: "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts",
        line: 1,
        text: "export const ProjectProfileMapper = {",
      },
    ]);
  });

  it("no envuelve un error de IGitTrackedFilesSource — se propaga tal cual", async () => {
    const sourceError = new Error("git boom");
    const source: IGitTrackedFilesSource = {
      async listTrackedFiles() {
        throw sourceError;
      },
    };
    const { reader } = fakeFileReader({});
    const search = new LiteralCodeSearch(source, reader);

    await expect(search.search("/repo", "x")).rejects.toBe(sourceError);
  });

  it("no envuelve un error de IFileReader — se propaga tal cual", async () => {
    const source = fakeTrackedFilesSource(["src/a.ts"]);
    const readerError = new Error("read boom");
    const reader: IFileReader = {
      async readFile() {
        throw readerError;
      },
    };
    const search = new LiteralCodeSearch(source, reader);

    await expect(search.search("/repo", "x")).rejects.toBe(readerError);
  });
});
