import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { CandidateExtractionResult } from "../models/CandidateExtractionResult.js";
import type { CommitSignal } from "../models/CommitSignal.js";
import type { CommitSnapshot } from "../models/CommitSnapshot.js";
import type { ICandidateExtractor } from "../ports/ICandidateExtractor.js";
import type { ICommitAnalyzer } from "../ports/ICommitAnalyzer.js";
import type { CommitNoiseFilterResult, ICommitNoiseFilter } from "../ports/ICommitNoiseFilter.js";
import { CandidateDetectionService } from "./CandidateDetectionService.js";

/**
 * Dobles de test para las tres dependencias de `CandidateDetectionService`
 * — deliberadamente "tontos" (devuelven exactamente lo configurado, sin
 * ninguna heurística propia), mismo criterio que `fakeGitHistorySource` en
 * `DeterministicCommitAnalyzer.test.ts`: evitan que el doble termine siendo
 * una segunda implementación de las reglas reales disfrazada de mock. Cada
 * uno registra sus llamadas para poder verificar orden y argumentos, no
 * solo el resultado final.
 */

function buildSnapshot(overrides: Partial<CommitSnapshot> = {}): CommitSnapshot {
  return {
    sha: "a".repeat(40),
    message: "test commit",
    author: "test",
    timestamp: new Date("2026-01-01T00:00:00Z"),
    diff: "",
    changedFiles: [],
    ...overrides,
  };
}

function buildSignal(overrides: Partial<CommitSignal> = {}): CommitSignal {
  return {
    commit: buildSnapshot(),
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    touchedPaths: [],
    recentRelatedCommits: [],
    ...overrides,
  };
}

function fakeAnalyzer(signal: CommitSignal): { analyzer: ICommitAnalyzer; calls: CommitSnapshot[] } {
  const calls: CommitSnapshot[] = [];
  return {
    analyzer: {
      analyze: async (commit) => {
        calls.push(commit);
        return signal;
      },
    },
    calls,
  };
}

function fakeNoiseFilter(result: CommitNoiseFilterResult): {
  noiseFilter: ICommitNoiseFilter;
  calls: CommitSignal[];
} {
  const calls: CommitSignal[] = [];
  return {
    noiseFilter: {
      shouldDiscard: (signal) => {
        calls.push(signal);
        return result;
      },
    },
    calls,
  };
}

function fakeExtractor(results: readonly CandidateExtractionResult[]): {
  extractor: ICandidateExtractor;
  calls: CommitSignal[];
} {
  const calls: CommitSignal[] = [];
  return {
    extractor: {
      extract: async (signal) => {
        calls.push(signal);
        return results;
      },
    },
    calls,
  };
}

const SAMPLE_CANDIDATE: MemoryCandidate = {
  type: "fact",
  scope: "global",
  projectId: null,
  content: "contenido de prueba",
  confidence: 0.5,
  importance: 0.5,
  source: {
    sourceType: "commit",
    sourceReference: "a".repeat(40),
    excerpt: "test commit",
    metadata: {},
  },
};

describe("CandidateDetectionService — early discard", () => {
  it("si el noise filter descarta, no llama al extractor y devuelve un único resultado rejected", async () => {
    const signal = buildSignal();
    const { analyzer } = fakeAnalyzer(signal);
    const { noiseFilter } = fakeNoiseFilter({ discard: true, reason: "ruido de build" });
    const { extractor, calls: extractorCalls } = fakeExtractor([
      { outcome: "ready", candidate: SAMPLE_CANDIDATE, riskSignals: [], reason: "no debería llegar aquí" },
    ]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    const results = await service.detect(buildSnapshot());

    expect(extractorCalls).toHaveLength(0);
    expect(results).toEqual([
      { outcome: "rejected", candidate: null, riskSignals: [], reason: "ruido de build" },
    ]);
  });

  it("propaga el reason exacto del noise filter en el resultado rejected", async () => {
    const signal = buildSignal();
    const { analyzer } = fakeAnalyzer(signal);
    const { noiseFilter } = fakeNoiseFilter({
      discard: true,
      reason: "Cambio cosmético trivial a README.md (<=5 líneas)",
    });
    const { extractor } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    const results = await service.detect(buildSnapshot());

    expect(results[0]?.reason).toBe("Cambio cosmético trivial a README.md (<=5 líneas)");
  });
});

describe("CandidateDetectionService — analyzer -> noise filter", () => {
  it("le pasa al noise filter exactamente el CommitSignal que produjo el analyzer, no el CommitSnapshot crudo", async () => {
    const signal = buildSignal({ filesChanged: 3, touchedPaths: ["a.ts", "b.ts", "c.ts"] });
    const { analyzer } = fakeAnalyzer(signal);
    const { noiseFilter, calls: noiseFilterCalls } = fakeNoiseFilter({
      discard: false,
      reason: "no es ruido",
    });
    const { extractor } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    await service.detect(buildSnapshot());

    expect(noiseFilterCalls).toHaveLength(1);
    expect(noiseFilterCalls[0]).toBe(signal);
  });

  it("le pasa al analyzer exactamente el CommitSnapshot recibido en detect()", async () => {
    const snapshot = buildSnapshot({ sha: "b".repeat(40), changedFiles: ["x.ts"] });
    const { analyzer, calls: analyzerCalls } = fakeAnalyzer(buildSignal());
    const { noiseFilter } = fakeNoiseFilter({ discard: true, reason: "ruido" });
    const { extractor } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    await service.detect(snapshot);

    expect(analyzerCalls).toEqual([snapshot]);
  });
});

describe("CandidateDetectionService — extractor no ejecutado cuando corresponde", () => {
  it("no invoca al extractor si discard: true (verificado por conteo de llamadas, no solo por el resultado)", async () => {
    const { analyzer } = fakeAnalyzer(buildSignal());
    const { noiseFilter } = fakeNoiseFilter({ discard: true, reason: "ruido" });
    const { extractor, calls } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    await service.detect(buildSnapshot());

    expect(calls).toHaveLength(0);
  });

  it("sí invoca al extractor exactamente una vez si discard: false", async () => {
    const { analyzer } = fakeAnalyzer(buildSignal());
    const { noiseFilter } = fakeNoiseFilter({ discard: false, reason: "no es ruido" });
    const { extractor, calls } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    await service.detect(buildSnapshot());

    expect(calls).toHaveLength(1);
  });
});

describe("CandidateDetectionService — resultados propagados correctamente", () => {
  it("devuelve exactamente lo que el extractor produce, sin transformar ni envolver", async () => {
    const signal = buildSignal();
    const { analyzer } = fakeAnalyzer(signal);
    const { noiseFilter } = fakeNoiseFilter({ discard: false, reason: "no es ruido" });
    const extractorResults: readonly CandidateExtractionResult[] = [
      { outcome: "pending_review", candidate: SAMPLE_CANDIDATE, riskSignals: [], reason: "regla A" },
      { outcome: "pending_review", candidate: SAMPLE_CANDIDATE, riskSignals: [], reason: "regla B" },
    ];
    const { extractor } = fakeExtractor(extractorResults);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    const results = await service.detect(buildSnapshot());

    expect(results).toBe(extractorResults);
  });

  it("un extractor que no encuentra nada (array vacío) se propaga tal cual, no se convierte en rejected", async () => {
    const { analyzer } = fakeAnalyzer(buildSignal());
    const { noiseFilter } = fakeNoiseFilter({ discard: false, reason: "no es ruido" });
    const { extractor } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    const results = await service.detect(buildSnapshot());

    expect(results).toEqual([]);
  });

  it("le pasa al extractor exactamente el mismo CommitSignal que recibió el noise filter", async () => {
    const signal = buildSignal({ touchedPaths: ["docs/adr/0001.md"] });
    const { analyzer } = fakeAnalyzer(signal);
    const { noiseFilter } = fakeNoiseFilter({ discard: false, reason: "no es ruido" });
    const { extractor, calls } = fakeExtractor([]);
    const service = new CandidateDetectionService(analyzer, noiseFilter, extractor);

    await service.detect(buildSnapshot());

    expect(calls[0]).toBe(signal);
  });
});
