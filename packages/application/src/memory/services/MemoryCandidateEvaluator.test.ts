import { describe, expect, it, vi } from "vitest";
import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { MemoryCandidateScore } from "../models/MemoryCandidateScore.js";
import type { MemoryDuplicateMatch } from "../models/MemoryDuplicateMatch.js";
import { evaluationOutcome } from "../models/MemoryEvaluation.js";
import type { IMemoryCandidateDeduplicator } from "../ports/IMemoryCandidateDeduplicator.js";
import type { IMemoryCandidateScorer } from "../ports/IMemoryCandidateScorer.js";
import type { IMemoryCandidateValidator } from "../ports/IMemoryCandidateValidator.js";
import type { IMemoryConflictDetector } from "../ports/IMemoryConflictDetector.js";
import { MemoryCandidateEvaluator } from "./MemoryCandidateEvaluator.js";

function buildCandidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    type: "fact",
    scope: "global",
    projectId: null,
    content: "Miller utiliza PostgreSQL.",
    confidence: 0.8,
    importance: 0.6,
    source: { sourceType: "conversation", sourceReference: "chat-1" },
    ...overrides,
  };
}

function fakeValidator(implementation: (candidate: MemoryCandidate) => void = () => undefined) {
  const validate = vi.fn(implementation);
  const validator: IMemoryCandidateValidator = { validate };
  return { validator, validate };
}

function fakeDeduplicator(result: MemoryDuplicateMatch | null = null) {
  const findDuplicate = vi.fn(async () => result);
  const deduplicator: IMemoryCandidateDeduplicator = { findDuplicate };
  return { deduplicator, findDuplicate };
}

function fakeConflictDetector(result: readonly string[] = []) {
  const findConflicts = vi.fn(async () => result);
  const conflictDetector: IMemoryConflictDetector = { findConflicts };
  return { conflictDetector, findConflicts };
}

function fakeScorer(score: number) {
  const scoreFn = vi.fn((): MemoryCandidateScore => ({ score }));
  const scorer: IMemoryCandidateScorer = { score: scoreFn };
  return { scorer, score: scoreFn };
}

describe("MemoryCandidateEvaluator", () => {
  it("acepta un candidato válido sin duplicados ni conflictos, con score por encima del umbral", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator(null);
    const { conflictDetector } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate());

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.duplicateOf).toBeNull();
    expect(evaluation.conflictsWith).toEqual([]);
    expect(evaluationOutcome(evaluation)).toBe("accepted");
  });

  it("rechaza cuando el validator lanza por confidence fuera de rango", async () => {
    const { validator } = fakeValidator(() => {
      throw new Error("confidence fuera de rango: 1.4");
    });
    const { deduplicator, findDuplicate } = fakeDeduplicator(null);
    const { conflictDetector, findConflicts } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate({ confidence: 1.4 }));

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.reason).toContain("confidence fuera de rango");
    expect(evaluationOutcome(evaluation)).toBe("rejected");
    // Validación falla -> ni deduplicación ni detección de conflictos deberían ejecutarse.
    expect(findDuplicate).not.toHaveBeenCalled();
    expect(findConflicts).not.toHaveBeenCalled();
  });

  it("rechaza cuando el validator lanza por importance fuera de rango", async () => {
    const { validator } = fakeValidator(() => {
      throw new Error("importance fuera de rango: -0.2");
    });
    const { deduplicator } = fakeDeduplicator(null);
    const { conflictDetector } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate({ importance: -0.2 }));

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.reason).toContain("importance fuera de rango");
    expect(evaluationOutcome(evaluation)).toBe("rejected");
  });

  it("rechaza un candidato válido si el score queda por debajo del umbral", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator(null);
    const { conflictDetector } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.2);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer, {
      acceptanceThreshold: 0.5,
    });

    const evaluation = await evaluator.evaluate(buildCandidate());

    expect(evaluation.accepted).toBe(false);
    expect(evaluationOutcome(evaluation)).toBe("rejected");
  });

  it("marca duplicateOf cuando el deduplicator encuentra coincidencia", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator({ memoryId: "mem-1", similarity: 0.96 });
    const { conflictDetector } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate());

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.duplicateOf).toBe("mem-1");
    expect(evaluation.conflictsWith).toEqual([]);
    expect(evaluationOutcome(evaluation)).toBe("duplicate");
  });

  it("marca conflictsWith cuando el conflict detector encuentra contradicciones", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator(null);
    const { conflictDetector } = fakeConflictDetector(["mem-2"]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate());

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.duplicateOf).toBeNull();
    expect(evaluation.conflictsWith).toEqual(["mem-2"]);
    expect(evaluationOutcome(evaluation)).toBe("conflict");
  });

  it("cuando hay duplicado Y conflicto a la vez, ambos campos quedan poblados y el outcome de reporting prioriza conflict", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator({ memoryId: "mem-1", similarity: 0.9 });
    const { conflictDetector } = fakeConflictDetector(["mem-2", "mem-3"]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate());

    // Ambos campos quedan poblados en la evaluación — ninguno se descarta
    // por el otro. Un futuro IMemoryCandidatePromoter debe leer estos dos
    // campos directamente (actualizar el duplicado Y crear la relación de
    // conflicto), nunca decidir en base a evaluationOutcome().
    expect(evaluation.duplicateOf).toBe("mem-1");
    expect(evaluation.conflictsWith).toEqual(["mem-2", "mem-3"]);
    // El outcome de reporting prioriza conflict sobre duplicate (un
    // conflicto requiere atención; un duplicado solo confirma lo ya sabido).
    expect(evaluationOutcome(evaluation)).toBe("conflict");
  });

  it("un candidato rechazado por score bajo mantiene precedencia rejected aunque haya duplicado/conflicto", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator({ memoryId: "mem-1", similarity: 0.9 });
    const { conflictDetector } = fakeConflictDetector(["mem-2"]);
    const { scorer } = fakeScorer(0.1);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer, {
      acceptanceThreshold: 0.5,
    });

    const evaluation = await evaluator.evaluate(buildCandidate());

    expect(evaluation.accepted).toBe(false);
    expect(evaluationOutcome(evaluation)).toBe("rejected");
  });

  it("el reason describe la razón real de la decisión", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator(null);
    const { conflictDetector } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer, {
      acceptanceThreshold: 0.5,
    });

    const evaluation = await evaluator.evaluate(buildCandidate());

    expect(evaluation.reason).toContain("0.90");
    expect(evaluation.reason).toContain("0.50");
  });

  it("preserva confidence/importance del candidato en la evaluación", async () => {
    const { validator } = fakeValidator();
    const { deduplicator } = fakeDeduplicator(null);
    const { conflictDetector } = fakeConflictDetector([]);
    const { scorer } = fakeScorer(0.9);
    const evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

    const evaluation = await evaluator.evaluate(buildCandidate({ confidence: 0.73, importance: 0.44 }));

    expect(evaluation.confidence).toBe(0.73);
    expect(evaluation.importance).toBe(0.44);
  });
});
