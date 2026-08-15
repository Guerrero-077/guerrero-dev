import { describe, expect, it } from "vitest";
import type { CommitSnapshot } from "../models/CommitSnapshot.js";
import type { IGitHistorySource } from "../ports/IGitHistorySource.js";
import { DeterministicCommitAnalyzer, HISTORY_QUERY_LIMIT } from "./DeterministicCommitAnalyzer.js";

function buildSnapshot(
  overrides: Partial<CommitSnapshot> & { changedFiles: readonly string[] },
): CommitSnapshot {
  return {
    sha: "current-sha",
    message: "test",
    author: "test",
    timestamp: new Date("2026-01-01T12:00:00Z"),
    diff: "",
    ...overrides,
  };
}

/**
 * Fake "tonto" de `IGitHistorySource`: mapea input -> SHAs exactamente
 * como se configuró, sin conocer conceptos como "path overlap" o
 * "rename" — eso evita que el fake termine siendo una segunda
 * implementación del analyzer disfrazada de mock. También registra cada
 * llamada para poder verificar qué argumentos (paths, `before`, `limit`)
 * recibió realmente.
 */
function fakeGitHistorySource(
  config: {
    touchingPaths?: ReadonlyMap<string, readonly string[]>;
    renameHistory?: ReadonlyMap<string, readonly string[]>;
  } = {},
) {
  const touchingPathsCalls: Array<{ paths: readonly string[]; before: Date; limit: number }> = [];
  const renameHistoryCalls: Array<{ path: string; before: Date; limit: number }> = [];

  const source: IGitHistorySource = {
    findCommitsTouchingPaths: async (paths, before, limit) => {
      touchingPathsCalls.push({ paths, before, limit });
      const key = [...paths].sort().join("|");
      return (config.touchingPaths?.get(key) ?? []).slice(0, limit);
    },
    findRenameHistory: async (path, before, limit) => {
      renameHistoryCalls.push({ path, before, limit });
      return (config.renameHistory?.get(path) ?? []).slice(0, limit);
    },
  };

  return { source, touchingPathsCalls, renameHistoryCalls };
}

describe("DeterministicCommitAnalyzer — estadísticas puras", () => {
  it("filesChanged/touchedPaths vienen de changedFiles, sin I/O (commit de un solo archivo)", async () => {
    const { source } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(buildSnapshot({ changedFiles: ["README.md"] }));

    expect(signal.filesChanged).toBe(1);
    expect(signal.touchedPaths).toEqual(["README.md"]);
  });

  it("preserva touchedPaths de un commit multi-capa (domain+application+infrastructure)", async () => {
    const { source } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    const changedFiles = [
      "packages/domain/src/memory/Memory.ts",
      "packages/application/src/memory/services/MemoryRanker.ts",
      "packages/infrastructure/src/database/repositories/DrizzleMemoryRepository.ts",
    ];
    const signal = await analyzer.analyze(buildSnapshot({ changedFiles }));

    expect(signal.filesChanged).toBe(3);
    expect(signal.touchedPaths).toEqual(changedFiles);
  });

  it("cuenta linesAdded/linesRemoved del diff, ignorando cabeceras +++/---", async () => {
    const { source } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    const diff = ["--- a/file.ts", "+++ b/file.ts", "+línea nueva 1", "+línea nueva 2", "-línea vieja"].join(
      "\n",
    );
    const signal = await analyzer.analyze(buildSnapshot({ changedFiles: ["file.ts"], diff }));

    expect(signal.linesAdded).toBe(2);
    expect(signal.linesRemoved).toBe(1);
  });

  it("cuenta correctamente un diff grande", async () => {
    const { source } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    const added = Array.from({ length: 500 }, (_, i) => `+línea ${i}`);
    const removed = Array.from({ length: 120 }, (_, i) => `-línea vieja ${i}`);
    const diff = [...added, ...removed].join("\n");
    const signal = await analyzer.analyze(buildSnapshot({ changedFiles: ["big.ts"], diff }));

    expect(signal.linesAdded).toBe(500);
    expect(signal.linesRemoved).toBe(120);
  });
});

describe("DeterministicCommitAnalyzer — recentRelatedCommits (contexto histórico)", () => {
  it("path overlap: consulta findCommitsTouchingPaths con los touchedPaths exactos", async () => {
    const key = ["packages/application/src/memory/services/MemoryRanker.ts"].sort().join("|");
    const { source, touchingPathsCalls } = fakeGitHistorySource({
      touchingPaths: new Map([[key, ["sha-path-overlap"]]]),
    });
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(
      buildSnapshot({ changedFiles: ["packages/application/src/memory/services/MemoryRanker.ts"] }),
    );

    expect(signal.recentRelatedCommits).toEqual([{ sha: "sha-path-overlap" }]);
    expect(touchingPathsCalls[0]?.paths).toEqual([
      "packages/application/src/memory/services/MemoryRanker.ts",
    ]);
  });

  it("directory overlap: deriva el directorio de los touchedPaths y lo consulta por separado", async () => {
    const dirKey = "packages/domain/src/memory";
    const { source, touchingPathsCalls } = fakeGitHistorySource({
      touchingPaths: new Map([[dirKey, ["sha-directory-overlap"]]]),
    });
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(
      buildSnapshot({ changedFiles: ["packages/domain/src/memory/MemoryCandidate.ts"] }),
    );

    expect(signal.recentRelatedCommits).toEqual([{ sha: "sha-directory-overlap" }]);
    // segunda llamada a findCommitsTouchingPaths es la de directorio, con el path exacto ya usado en la primera
    expect(touchingPathsCalls).toHaveLength(2);
    expect(touchingPathsCalls[1]?.paths).toEqual([dirKey]);
  });

  it("archivo en la raíz (sin '/'): no dispara una consulta de directory overlap", async () => {
    const { source, touchingPathsCalls } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    await analyzer.analyze(buildSnapshot({ changedFiles: ["README.md"] }));

    // solo la consulta de path overlap; ninguna de directorio
    expect(touchingPathsCalls).toHaveLength(1);
  });

  it("rename continuity: consulta findRenameHistory por cada touched path", async () => {
    const { source, renameHistoryCalls } = fakeGitHistorySource({
      renameHistory: new Map([["packages/domain/src/memory/Memory.ts", ["sha-rename"]]]),
    });
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(
      buildSnapshot({ changedFiles: ["packages/domain/src/memory/Memory.ts"] }),
    );

    expect(signal.recentRelatedCommits).toEqual([{ sha: "sha-rename" }]);
    expect(renameHistoryCalls).toHaveLength(1);
    expect(renameHistoryCalls[0]?.path).toBe("packages/domain/src/memory/Memory.ts");
  });

  it("siempre pasa commit.timestamp como before a ambas operaciones — nunca mira hacia adelante", async () => {
    const { source, touchingPathsCalls, renameHistoryCalls } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    const timestamp = new Date("2026-03-10T08:00:00Z");
    await analyzer.analyze(buildSnapshot({ changedFiles: ["a/b.ts"], timestamp }));

    for (const call of touchingPathsCalls) {
      expect(call.before).toBe(timestamp);
    }
    for (const call of renameHistoryCalls) {
      expect(call.before).toBe(timestamp);
    }
  });

  it("deduplica SHAs que aparecen en múltiples consultas (path overlap + directory overlap + rename)", async () => {
    const path = "packages/domain/src/memory/Memory.ts";
    const pathKey = [path].sort().join("|");
    const dirKey = "packages/domain/src/memory";
    const { source } = fakeGitHistorySource({
      touchingPaths: new Map([
        [pathKey, ["sha-shared"]],
        [dirKey, ["sha-shared"]],
      ]),
      renameHistory: new Map([[path, ["sha-shared"]]]),
    });
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(buildSnapshot({ changedFiles: [path] }));

    // las tres heurísticas apuntan al mismo commit: una sola CommitReference, no tres
    expect(signal.recentRelatedCommits).toEqual([{ sha: "sha-shared" }]);
  });

  it(`limita el resultado final a HISTORY_QUERY_LIMIT (${HISTORY_QUERY_LIMIT})`, async () => {
    const path = "packages/domain/src/memory/Memory.ts";
    const pathKey = [path].sort().join("|");
    const manyShas = Array.from({ length: HISTORY_QUERY_LIMIT + 10 }, (_, i) => `sha-${i}`);
    const { source } = fakeGitHistorySource({
      touchingPaths: new Map([[pathKey, manyShas]]),
    });
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(buildSnapshot({ changedFiles: [path] }));

    expect(signal.recentRelatedCommits).toHaveLength(HISTORY_QUERY_LIMIT);
  });

  it("paths sin resultados configurados: recentRelatedCommits queda vacío, no inventa relaciones", async () => {
    const { source } = fakeGitHistorySource();
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(
      buildSnapshot({
        changedFiles: ["packages/infrastructure/src/database/repositories/DrizzleMemoryRepository.ts"],
      }),
    );

    expect(signal.recentRelatedCommits).toEqual([]);
  });

  it("nunca incluye el propio sha del commit analizado, aunque la fuente lo devuelva por error", async () => {
    const path = "packages/domain/src/memory/Memory.ts";
    const pathKey = [path].sort().join("|");
    const { source } = fakeGitHistorySource({
      touchingPaths: new Map([[pathKey, ["current-sha", "sha-otro"]]]),
    });
    const analyzer = new DeterministicCommitAnalyzer(source);

    const signal = await analyzer.analyze(buildSnapshot({ sha: "current-sha", changedFiles: [path] }));

    expect(signal.recentRelatedCommits).toEqual([{ sha: "sha-otro" }]);
  });
});
