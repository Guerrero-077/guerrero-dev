import { describe, expect, it } from "vitest";
import type { CommitSignal } from "../models/CommitSignal.js";
import { DeterministicCommitNoiseFilter } from "./DeterministicCommitNoiseFilter.js";

function buildSignal(overrides: Partial<CommitSignal> & { touchedPaths: readonly string[] }): CommitSignal {
  return {
    commit: {
      sha: "deadbeef",
      message: "test",
      author: "test",
      timestamp: new Date("2026-01-01"),
      diff: "",
      changedFiles: overrides.touchedPaths,
    },
    filesChanged: overrides.touchedPaths.length,
    linesAdded: 0,
    linesRemoved: 0,
    recentRelatedCommits: [],
    ...overrides,
  };
}

describe("DeterministicCommitNoiseFilter — reglas unitarias", () => {
  const filter = new DeterministicCommitNoiseFilter();

  describe("regla 1: artefactos de build", () => {
    it("descarta .gitignore + *.tsbuildinfo puros", () => {
      const result = filter.shouldDiscard(
        buildSignal({ touchedPaths: [".gitignore", "packages/domain/tsconfig.tsbuildinfo"] }),
      );
      expect(result.discard).toBe(true);
    });

    it("NO descarta si además hay código real (doctor.ts) mezclado con *.tsbuildinfo", () => {
      const result = filter.shouldDiscard(
        buildSignal({
          touchedPaths: ["apps/cli/src/commands/doctor.ts", "packages/domain/tsconfig.tsbuildinfo"],
        }),
      );
      expect(result.discard).toBe(false);
    });

    it("NO descarta *.tsbuildinfo mezclado con pnpm-lock.yaml (caso real 1845a52)", () => {
      const result = filter.shouldDiscard(
        buildSignal({ touchedPaths: ["packages/domain/tsconfig.tsbuildinfo", "pnpm-lock.yaml"] }),
      );
      expect(result.discard).toBe(false);
    });
  });

  describe("regla 2: archivos generados EF/ORM", () => {
    it("descarta cuando el 100% son .designer.cs/.edmx/.tt", () => {
      const result = filter.shouldDiscard(
        buildSignal({
          touchedPaths: [
            "Diagrama/Diagram/Arriendo_Alcaldia.Designer.cs",
            "Diagrama/Diagram/Arriendo_Alcaldia.edmx",
          ],
        }),
      );
      expect(result.discard).toBe(true);
    });

    it("NO descarta si hay un solo archivo .cs plano mezclado (caso real 6537bec, gap conocido)", () => {
      const result = filter.shouldDiscard(
        buildSignal({
          touchedPaths: ["Diagrama/Diagram/Arriendo_Alcaldia.edmx", "Diagrama/Diagram/Appointments.cs"],
        }),
      );
      expect(result.discard).toBe(false);
    });
  });

  describe("regla 3: README trivial", () => {
    it("descarta un único README.md con diff chico", () => {
      const result = filter.shouldDiscard(buildSignal({ touchedPaths: ["README.md"], linesAdded: 2 }));
      expect(result.discard).toBe(true);
    });

    it("NO descarta README.md si el diff es grande", () => {
      const result = filter.shouldDiscard(buildSignal({ touchedPaths: ["README.md"], linesAdded: 80 }));
      expect(result.discard).toBe(false);
    });

    it("NO descarta otro doc grande de un solo archivo (docs/fase-4-memory-engine.md)", () => {
      const result = filter.shouldDiscard(
        buildSignal({ touchedPaths: ["docs/fase-4-memory-engine.md"], linesAdded: 420 }),
      );
      expect(result.discard).toBe(false);
    });
  });

  it("no descarta un commit vacío de paths (caso borde, no debería ocurrir en la práctica)", () => {
    const result = filter.shouldDiscard(buildSignal({ touchedPaths: [] }));
    expect(result.discard).toBe(false);
  });
});
