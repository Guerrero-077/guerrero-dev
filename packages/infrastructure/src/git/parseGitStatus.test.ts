import { describe, expect, it } from "vitest";
import { GitWorkingTreeSourceError } from "./GitWorkingTreeSourceError.js";
import { parseGitStatus } from "./parseGitStatus.js";

describe("parseGitStatus", () => {
  it("parsea líneas reales de git status --porcelain=v1", () => {
    const stdout = " M packages/agent-core/src/AgentOrchestrator.ts\n?? scratch.txt\nA  nuevo.ts\n";

    expect(parseGitStatus(stdout)).toEqual([
      { statusCode: " M", path: "packages/agent-core/src/AgentOrchestrator.ts" },
      { statusCode: "??", path: "scratch.txt" },
      { statusCode: "A ", path: "nuevo.ts" },
    ]);
  });

  it("stdout vacío devuelve lista vacía (working tree limpio)", () => {
    expect(parseGitStatus("")).toEqual([]);
  });

  it("conserva 'old -> new' completo en un rename, sin partirlo", () => {
    const stdout = "R  viejo-nombre.ts -> nuevo-nombre.ts\n";

    expect(parseGitStatus(stdout)).toEqual([{ statusCode: "R ", path: "viejo-nombre.ts -> nuevo-nombre.ts" }]);
  });

  it("rechaza una línea sin espacio separador en la posición esperada", () => {
    expect(() => parseGitStatus("MMarchivo-sin-espacio.ts\n")).toThrow(GitWorkingTreeSourceError);
  });

  it("rechaza una línea demasiado corta", () => {
    expect(() => parseGitStatus("M\n")).toThrow(GitWorkingTreeSourceError);
  });

  it("el error rechazado trae reason invalid_output", () => {
    const error = (() => {
      try {
        parseGitStatus("x\n");
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(GitWorkingTreeSourceError);
    expect((error as GitWorkingTreeSourceError).reason).toBe("invalid_output");
  });
});
