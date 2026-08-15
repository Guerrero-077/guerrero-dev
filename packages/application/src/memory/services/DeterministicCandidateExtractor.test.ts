import { describe, expect, it } from "vitest";
import type { CommitSignal } from "../models/CommitSignal.js";
import { DeterministicCandidateExtractor } from "./DeterministicCandidateExtractor.js";

function buildSignal(overrides: Partial<CommitSignal> & { touchedPaths: readonly string[] }): CommitSignal {
  return {
    commit: {
      sha: "deadbeef",
      message: "test commit",
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

function ruleNames(
  results: readonly { candidate: { source: { metadata?: Record<string, unknown> } } | null }[],
) {
  return results.map((r) => r.candidate?.source.metadata?.["rule"]).sort();
}

describe("DeterministicCandidateExtractor — ADR_PATH", () => {
  const extractor = new DeterministicCandidateExtractor();

  it("dispara con un archivo bajo docs/adr/", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["docs/adr/0001-decision.md"] }));
    expect(ruleNames(results)).toEqual(["ADR_PATH"]);
    expect(results[0]?.outcome).toBe("pending_review");
    expect(results[0]?.candidate?.type).toBe("decision");
  });

  it("dispara aunque haya otros archivos no-docs mezclados (no exige el 100%)", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: [".editorconfig", "docs/adr/0001-decision.md"] }),
    );
    expect(ruleNames(results)).toContain("ADR_PATH");
  });

  it("no dispara sin ningún path bajo docs/adr/", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["docs/readme.md"] }));
    expect(ruleNames(results)).not.toContain("ADR_PATH");
  });
});

describe("DeterministicCandidateExtractor — DOCS_PATH", () => {
  const extractor = new DeterministicCandidateExtractor();

  it("dispara cuando el 100% de los paths están bajo docs/ (sin ADR)", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["docs/fase-3.md"] }));
    expect(ruleNames(results)).toEqual(["DOCS_PATH"]);
    expect(results[0]?.candidate?.type).toBe("knowledge");
  });

  it("NO dispara si docs/ es solo un archivo incidental entre muchos otros", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["docs/fase-3.md", "src/a.ts", "src/b.ts"] }),
    );
    expect(ruleNames(results)).not.toContain("DOCS_PATH");
  });

  it("no se solapa con ADR_PATH (mutuamente excluyentes)", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["docs/adr/0001.md"] }));
    expect(ruleNames(results)).not.toContain("DOCS_PATH");
  });
});

describe("DeterministicCandidateExtractor — SCHEMA_PATH", () => {
  const extractor = new DeterministicCandidateExtractor();

  it("dispara con un path bajo database/migrations/", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["packages/infrastructure/src/database/migrations/0002_x.sql"] }),
    );
    expect(ruleNames(results)).toEqual(["SCHEMA_PATH"]);
    expect(results[0]?.candidate?.type).toBe("fact");
  });

  it("dispara con un path bajo database/schema/", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["packages/infrastructure/src/database/schema/memories.ts"] }),
    );
    expect(ruleNames(results)).toEqual(["SCHEMA_PATH"]);
  });

  it("nunca produce type: 'decision' — solo 'fact' (restricción explícita)", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["database/migrations/0001.sql"] }));
    expect(results[0]?.candidate?.type).not.toBe("decision");
  });

  it("no dispara con un path de configuración EF que no está bajo database/migrations|schema", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["GESCOMPH/Entity/Infrastructure/Configurations/FooConfiguration.cs"] }),
    );
    expect(ruleNames(results)).not.toContain("SCHEMA_PATH");
  });
});

describe("DeterministicCandidateExtractor — INTERFACE_IMPL_DI_PATTERN", () => {
  const extractor = new DeterministicCandidateExtractor();

  it("dispara con interfaz + implementación de nombre exacto", async () => {
    const results = await extractor.extract(
      buildSignal({
        touchedPaths: [
          "IMercadoPagoService.cs",
          "MercadoPagoService.cs",
          "MercadoPagoServiceCollectionExtensions.cs",
        ],
      }),
    );
    expect(ruleNames(results)).toEqual(["INTERFACE_IMPL_DI_PATTERN"]);
    expect(results[0]?.candidate?.type).toBe("pattern");
  });

  it("dispara con implementación cuyo nombre CONTIENE el base name, sin igualarlo (caso real a384c61)", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["IObligationNotifier.cs", "SignalRObligationNotifier.cs", "Program.cs"] }),
    );
    expect(ruleNames(results)).toEqual(["INTERFACE_IMPL_DI_PATTERN"]);
  });

  it("NO exige un archivo de registro DI dedicado (caso real a384c61: solo Program.cs)", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["IObligationNotifier.cs", "SignalRObligationNotifier.cs"] }),
    );
    expect(ruleNames(results)).toEqual(["INTERFACE_IMPL_DI_PATTERN"]);
  });

  it("no dispara con una interfaz sola, sin implementación tocada en el mismo commit", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["IMercadoPagoService.cs"] }));
    expect(ruleNames(results)).not.toContain("INTERFACE_IMPL_DI_PATTERN");
  });

  it("no dispara con un solo archivo de Configuration EF sin interfaz (caso real af3fe10/60c34f2)", async () => {
    const results = await extractor.extract(
      buildSignal({
        touchedPaths: ["GESCOMPH/Entity/Infrastructure/Configurations/NotificationConfiguration.cs"],
      }),
    );
    expect(ruleNames(results)).not.toContain("INTERFACE_IMPL_DI_PATTERN");
  });
});

describe("DeterministicCandidateExtractor — TEST_PATH_PATTERN", () => {
  const extractor = new DeterministicCandidateExtractor();

  it("dispara cuando la mayoría de los paths son de test", async () => {
    const results = await extractor.extract(
      buildSignal({
        touchedPaths: ["Test/Modulo/ATests.cs", "Test/Modulo/BTests.cs", "Data/Repository.cs"],
      }),
    );
    expect(ruleNames(results)).toEqual(["TEST_PATH_PATTERN"]);
    expect(results[0]?.candidate?.type).toBe("pattern");
  });

  it("reconoce convención TS (*.test.ts / *.spec.ts) y directorio tests/", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["packages/application/src/projects/projects.test.ts"] }),
    );
    expect(ruleNames(results)).toEqual(["TEST_PATH_PATTERN"]);
  });

  it("NO dispara cuando los tests son minoría (caso real a384c61: 1/8)", async () => {
    const results = await extractor.extract(
      buildSignal({
        touchedPaths: [
          "IObligationNotifier.cs",
          "SignalRObligationNotifier.cs",
          "Program.cs",
          "CollectionJobs.cs",
          "ObligationMonthService.cs",
          "Contract.cs",
          "MercadoPagoService.cs",
          "Test/Modulo/Business/ContractServiceTests.cs",
        ],
      }),
    );
    expect(ruleNames(results)).not.toContain("TEST_PATH_PATTERN");
  });
});

describe("DeterministicCandidateExtractor — comportamiento general", () => {
  const extractor = new DeterministicCandidateExtractor();

  it("devuelve [] cuando ninguna regla tiene evidencia suficiente ('no sé', no inventa)", async () => {
    const results = await extractor.extract(
      buildSignal({ touchedPaths: ["apps/cli/src/commands/doctor.ts"] }),
    );
    expect(results).toEqual([]);
  });

  it("puede disparar varias reglas del mismo commit (caso real 4a631af: SCHEMA_PATH + INTERFACE_IMPL_DI_PATTERN)", async () => {
    const results = await extractor.extract(
      buildSignal({
        touchedPaths: [
          "packages/infrastructure/src/database/migrations/0001_init.sql",
          "packages/application/src/common/ports/IProjectRepository.ts",
          "packages/infrastructure/src/database/repositories/DrizzleProjectRepository.ts",
        ],
      }),
    );
    expect(ruleNames(results)).toEqual(["INTERFACE_IMPL_DI_PATTERN", "SCHEMA_PATH"]);
  });

  it("todo resultado tiene outcome pending_review, nunca ready (ninguna regla afirma verdad semántica)", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["docs/adr/0001.md"] }));
    expect(results.every((r) => r.outcome === "pending_review")).toBe(true);
  });

  it("cada resultado registra su regla en source.metadata.rule, sin campo ruleName en el contrato", async () => {
    const results = await extractor.extract(buildSignal({ touchedPaths: ["docs/adr/0001.md"] }));
    expect(results[0]?.candidate?.source.metadata?.["rule"]).toBe("ADR_PATH");
    expect(results[0]).not.toHaveProperty("ruleName");
  });
});
