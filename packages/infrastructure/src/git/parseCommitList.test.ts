import { describe, expect, it } from "vitest";
import { GitHistorySourceError } from "./GitHistorySourceError.js";
import { parseCommitList } from "./parseCommitList.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

describe("parseCommitList", () => {
  it("parsea múltiples SHAs, una por línea", () => {
    expect(parseCommitList(`${SHA_A}\n${SHA_B}`)).toEqual([SHA_A, SHA_B]);
  });

  it("parsea una sola SHA sin salto de línea final", () => {
    expect(parseCommitList(SHA_A)).toEqual([SHA_A]);
  });

  it("stdout vacío -> lista vacía (pathspec sin coincidencias, no es un error)", () => {
    expect(parseCommitList("")).toEqual([]);
  });

  it("ignora líneas vacías intermedias", () => {
    expect(parseCommitList(`${SHA_A}\n\n${SHA_B}\n`)).toEqual([SHA_A, SHA_B]);
  });

  it("recorta espacios en blanco alrededor de cada línea", () => {
    expect(parseCommitList(`  ${SHA_A}  \n${SHA_B}`)).toEqual([SHA_A, SHA_B]);
  });

  it("lanza GitHistorySourceError(invalid_output) si una línea no es una SHA de 40 hex", () => {
    expect(() => parseCommitList("no-es-una-sha")).toThrow(GitHistorySourceError);
    try {
      parseCommitList("no-es-una-sha");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GitHistorySourceError);
      expect((error as GitHistorySourceError).reason).toBe("invalid_output");
    }
  });

  it("lanza GitHistorySourceError(invalid_output) si una SHA está truncada (menos de 40 hex)", () => {
    expect(() => parseCommitList(SHA_A.slice(0, 7))).toThrow(GitHistorySourceError);
  });

  it("lanza GitHistorySourceError(invalid_output) si una línea válida se mezcla con una inválida", () => {
    expect(() => parseCommitList(`${SHA_A}\nbasura`)).toThrow(GitHistorySourceError);
  });
});
