import { describe, expect, it } from "vitest";
import { GitTrackedFilesSourceError } from "./GitTrackedFilesSourceError.js";
import { parseTrackedFiles } from "./parseTrackedFiles.js";

describe("parseTrackedFiles", () => {
  it("stdout vacío -> lista vacía", () => {
    expect(parseTrackedFiles("")).toEqual([]);
  });

  it("parsea varias rutas separadas por NUL, incluyendo el NUL final que agrega -z", () => {
    const stdout = "package.json\0packages/domain/src/project/ProjectProfile.ts\0";

    expect(parseTrackedFiles(stdout)).toEqual([
      "package.json",
      "packages/domain/src/project/ProjectProfile.ts",
    ]);
  });

  it("preserva espacios y Unicode sin reinterpretarlos ni normalizarlos", () => {
    const stdout = "apps/my app/src/index.ts\0packages/área/src/index.ts\0";

    expect(parseTrackedFiles(stdout)).toEqual(["apps/my app/src/index.ts", "packages/área/src/index.ts"]);
  });

  it.each([
    ["/etc/passwd", "absoluta POSIX"],
    ["C:/repo/file.ts", "absoluta Windows con /"],
    ["C:\\repo\\file.ts", "absoluta Windows con \\"],
    ["..\\file.ts", "separador Windows con .."],
    ["../file.ts", "escapa el root con .. al inicio"],
    ["apps/../file.ts", "escapa el root con .. en un segmento interno"],
  ])("rechaza con invalid_output una ruta que viola el contrato de 5.1 (%s: %s)", (path) => {
    const stdout = `${path}\0`;

    expect(() => parseTrackedFiles(stdout)).toThrow(GitTrackedFilesSourceError);
    try {
      parseTrackedFiles(stdout);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GitTrackedFilesSourceError);
      expect((error as GitTrackedFilesSourceError).reason).toBe("invalid_output");
    }
  });
});
