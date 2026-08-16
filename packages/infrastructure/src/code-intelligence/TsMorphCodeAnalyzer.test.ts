import type { IFileReader, IGitTrackedFilesSource } from "@guerrero-dev/application";
import { describe, expect, it } from "vitest";
import { TsMorphCodeAnalyzer } from "./TsMorphCodeAnalyzer.js";
import { TsMorphCodeAnalyzerError } from "./TsMorphCodeAnalyzerError.js";

/**
 * Dobles de test deliberadamente "tontos" — mismo criterio que
 * `ProjectProfileScanner.test.ts`: devuelven exactamente lo configurado,
 * registran sus llamadas. Sin Git ni disco real — el dogfooding contra
 * `guerrero-dev` real queda para 6.5 (ya congelado).
 */
function fakeTrackedFilesSource(files: readonly string[]): {
  source: IGitTrackedFilesSource;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    source: {
      async listTrackedFiles(repoRoot) {
        calls.push(repoRoot);
        return files;
      },
    },
    calls,
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

describe("TsMorphCodeAnalyzer", () => {
  it("ensambla un CodeIndex a partir de varios archivos .ts trackeados", async () => {
    const { source } = fakeTrackedFilesSource(["src/a.ts", "src/b.ts"]);
    const { reader } = fakeFileReader({
      "src/a.ts": 'import { b } from "./b.js";\nexport function a() { return b(); }\n',
      "src/b.ts": "export function b() { return 1; }\n",
    });
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    const index = await analyzer.analyze("/repo");

    expect(index.symbols.map((s) => s.name)).toEqual(["a", "b"]);
    expect(index.edges).toEqual([
      { fromFile: "src/a.ts", target: "./b.js", kind: "import", importedNames: ["b"] },
    ]);
  });

  it("filtra a solo archivos .ts — ignora archivos con otra extensión", async () => {
    const { source } = fakeTrackedFilesSource(["src/a.ts", "README.md", "package.json"]);
    const { reader, calls } = fakeFileReader({ "src/a.ts": "export const a = 1;\n" });
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    await analyzer.analyze("/repo");

    expect(calls).toEqual([{ repoRoot: "/repo", relativePath: "src/a.ts" }]);
  });

  it("incluye archivos *.test.ts — mapa §4: todos los .ts trackeados, sin excepción editorial", async () => {
    const { source } = fakeTrackedFilesSource(["src/a.test.ts"]);
    const { reader } = fakeFileReader({ "src/a.test.ts": "export const t = 1;\n" });
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    const index = await analyzer.analyze("/repo");

    expect(index.symbols).toHaveLength(1);
  });

  it("propaga repoRoot exactamente a ambos puertos", async () => {
    const { source, calls: sourceCalls } = fakeTrackedFilesSource(["src/a.ts"]);
    const { reader, calls: readerCalls } = fakeFileReader({ "src/a.ts": "export const a = 1;\n" });
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    await analyzer.analyze("/algun/repo");

    expect(sourceCalls).toEqual(["/algun/repo"]);
    expect(readerCalls).toEqual([{ repoRoot: "/algun/repo", relativePath: "src/a.ts" }]);
  });

  it("índice vacío cuando no hay archivos .ts trackeados", async () => {
    const { source } = fakeTrackedFilesSource([]);
    const { reader } = fakeFileReader({});
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    const index = await analyzer.analyze("/repo");

    expect(index).toEqual({ symbols: [], edges: [] });
  });

  it("sintaxis inválida en cualquier archivo lanza TsMorphCodeAnalyzerError — todo o nada", async () => {
    const { source } = fakeTrackedFilesSource(["src/good.ts", "src/broken.ts"]);
    const { reader } = fakeFileReader({
      "src/good.ts": "export const ok = 1;\n",
      "src/broken.ts": "export function broken( {\n  const x =;\n",
    });
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    await expect(analyzer.analyze("/repo")).rejects.toBeInstanceOf(TsMorphCodeAnalyzerError);
  });

  it("el mensaje del error de sintaxis identifica el archivo problemático", async () => {
    const { source } = fakeTrackedFilesSource(["src/broken.ts"]);
    const { reader } = fakeFileReader({ "src/broken.ts": "export function broken( {\n  const x =;\n" });
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    await expect(analyzer.analyze("/repo")).rejects.toThrow("src/broken.ts");
  });

  it("propaga sin envolver un error de IGitTrackedFilesSource", async () => {
    const sourceError = new Error("git boom");
    const source: IGitTrackedFilesSource = {
      async listTrackedFiles() {
        throw sourceError;
      },
    };
    const { reader } = fakeFileReader({});
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    await expect(analyzer.analyze("/repo")).rejects.toBe(sourceError);
  });

  it("propaga sin envolver un error de IFileReader", async () => {
    const { source } = fakeTrackedFilesSource(["src/a.ts"]);
    const readerError = new Error("read boom");
    const reader: IFileReader = {
      async readFile() {
        throw readerError;
      },
    };
    const analyzer = new TsMorphCodeAnalyzer(source, reader);

    await expect(analyzer.analyze("/repo")).rejects.toBe(readerError);
  });
});
