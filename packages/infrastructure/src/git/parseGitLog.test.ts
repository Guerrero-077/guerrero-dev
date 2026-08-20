import { describe, expect, it } from "vitest";
import { GIT_LOG_FIELD_SEPARATOR as FS, GIT_LOG_RECORD_SEPARATOR as RS, parseGitLog } from "./parseGitLog.js";
import { GitWorkingTreeSourceError } from "./GitWorkingTreeSourceError.js";

function record(hash: string, authorName: string, authorDate: string, subject: string): string {
  return `${hash}${FS}${authorName}${FS}${authorDate}${FS}${subject}${RS}`;
}

describe("parseGitLog", () => {
  it("parsea varios registros reales, del más nuevo al más viejo tal como llegan", () => {
    const stdout =
      record("b".repeat(40), "Santiago", "2026-08-20T10:00:00-03:00", "fix: algo") +
      record("a".repeat(40), "Santiago", "2026-08-18T09:00:00-03:00", "feat: primero");

    expect(parseGitLog(stdout)).toEqual([
      { hash: "b".repeat(40), authorName: "Santiago", authorDate: "2026-08-20T10:00:00-03:00", subject: "fix: algo" },
      {
        hash: "a".repeat(40),
        authorName: "Santiago",
        authorDate: "2026-08-18T09:00:00-03:00",
        subject: "feat: primero",
      },
    ]);
  });

  it("stdout vacío devuelve lista vacía (repositorio sin commits)", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  it("tolera el \\n final que Git real agrega después del último RS (verificado real, no solo el fixture)", () => {
    const stdout = `${record("a".repeat(40), "Santiago", "2026-08-18T09:00:00-03:00", "feat: primero")}\n`;

    expect(parseGitLog(stdout)).toEqual([
      {
        hash: "a".repeat(40),
        authorName: "Santiago",
        authorDate: "2026-08-18T09:00:00-03:00",
        subject: "feat: primero",
      },
    ]);
  });

  it("un asunto de commit con caracteres arbitrarios no rompe el parseo (separadores de control, no coma/pipe)", () => {
    const stdout = record("c".repeat(40), "Santiago", "2026-08-20T10:00:00-03:00", "fix: a, b | c -> d");

    expect(parseGitLog(stdout)).toEqual([
      {
        hash: "c".repeat(40),
        authorName: "Santiago",
        authorDate: "2026-08-20T10:00:00-03:00",
        subject: "fix: a, b | c -> d",
      },
    ]);
  });

  it("rechaza un registro con menos de 4 campos", () => {
    const stdout = `${"a".repeat(40)}${FS}Santiago${RS}`;

    expect(() => parseGitLog(stdout)).toThrow(GitWorkingTreeSourceError);
  });

  it("el error rechazado trae reason invalid_output", () => {
    const stdout = `solo-un-campo${RS}`;

    const error = (() => {
      try {
        parseGitLog(stdout);
        return undefined;
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(GitWorkingTreeSourceError);
    expect((error as GitWorkingTreeSourceError).reason).toBe("invalid_output");
  });
});
